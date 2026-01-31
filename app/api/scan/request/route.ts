import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { getPool, query, type User } from "@/lib/db";

/**
 * POST /api/scan/request – Pro users request a keyword scan (priority ingestion queue).
 * Rate limit: 1 request per 6 hours per user (KV scan_limit:${userId}).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEYWORD_MAX_LENGTH = 100;
const SCAN_COOLDOWN_SECONDS = 6 * 60 * 60; // 6 hours
const KV_RATE_LIMIT_KEY_PREFIX = "scan_limit:";
const ESTIMATED_MINUTES_PER_POSITION = 15;

/** Resolve user plan from users table by Clerk ID; default 'free'. */
async function getPlanForUser(clerkUserId: string): Promise<"free" | "pro"> {
  try {
    const pool = getPool();
    if (!pool) return "free";
    const { rows } = await query<Pick<User, "plan">>(
      `SELECT plan FROM users WHERE clerk_user_id = $1 LIMIT 1`,
      [clerkUserId]
    );
    const plan = rows[0]?.plan;
    return plan === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}

function sanitizeKeyword(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, KEYWORD_MAX_LENGTH);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      {
        error: "Authentication required",
        message: "Please sign in to request a scan.",
        code: "AUTH_REQUIRED",
      },
      { status: 401 }
    );
  }

  const plan = await getPlanForUser(userId);
  if (plan !== "pro") {
    return NextResponse.json(
      {
        error: "Pro subscription required",
        message: "Keyword scan requests are for Pro users. Upgrade to request on-demand scans.",
        code: "PRO_REQUIRED",
        upgradeUrl: "/upgrade",
      },
      { status: 403 }
    );
  }

  const rateLimitKey = `${KV_RATE_LIMIT_KEY_PREFIX}${userId}`;
  try {
    const cooldownUntil = await kv.get<number>(rateLimitKey);
    if (cooldownUntil != null && typeof cooldownUntil === "number") {
      const nowSec = Math.floor(Date.now() / 1000);
      const retryAfter = Math.max(1, cooldownUntil - nowSec);
      const res = NextResponse.json(
        {
          error: "Too many scan requests",
          message: "You can request one scan every 6 hours. Please try again later.",
          code: "RATE_LIMITED",
          retryAfter,
        },
        { status: 429 }
      );
      res.headers.set("Retry-After", String(retryAfter));
      return res;
    }
  } catch {
    // KV failure: allow request (fail open)
  }

  let body: { keyword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", message: "Request body must be JSON with a keyword field.", code: "INVALID_BODY" },
      { status: 400 }
    );
  }

  const rawKeyword = typeof body?.keyword === "string" ? body.keyword : "";
  const keyword = sanitizeKeyword(rawKeyword);
  if (keyword.length === 0) {
    return NextResponse.json(
      { error: "Invalid keyword", message: "Keyword is required and must be a non-empty string (max 100 chars).", code: "INVALID_KEYWORD" },
      { status: 400 }
    );
  }

  const pool = getPool();
  if (!pool) {
    return NextResponse.json(
      { error: "Database temporarily unavailable", code: "DB_UNAVAILABLE" },
      { status: 503 }
    );
  }

  try {
    const { rows: existing } = await query<{ id: number }>(
      `SELECT id FROM priority_ingestion_queue WHERE LOWER(TRIM(keyword)) = LOWER($1) AND status = 'pending' LIMIT 1`,
      [keyword]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        {
          error: "Duplicate request",
          message: "This keyword already has a pending scan request.",
          code: "DUPLICATE_REQUEST",
        },
        { status: 409 }
      );
    }

    const { rows: inserted } = await query<{ id: number; requested_at: string }>(
      `INSERT INTO priority_ingestion_queue (keyword, requested_by, status, priority)
       VALUES ($1, $2, 'pending', 1)
       RETURNING id, requested_at`,
      [keyword, userId]
    );
    const row = inserted[0];
    if (!row) {
      return NextResponse.json(
        { error: "Insert failed", code: "INSERT_FAILED" },
        { status: 500 }
      );
    }

    const { rows: positionRows } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM priority_ingestion_queue
       WHERE status IN ('pending', 'processing') AND requested_at <= $1::timestamptz`,
      [row.requested_at]
    );
    const position = Math.max(1, parseInt(positionRows[0]?.count ?? "1", 10));
    const estimatedMinutes = Math.max(1, position * ESTIMATED_MINUTES_PER_POSITION);

    try {
      const cooldownUntilSec = Math.floor(Date.now() / 1000) + SCAN_COOLDOWN_SECONDS;
      await kv.set(rateLimitKey, cooldownUntilSec, { ex: SCAN_COOLDOWN_SECONDS });
    } catch {
      // KV write failure: request still succeeded
    }

    return NextResponse.json({
      message: "Scan request added to the queue.",
      position,
      estimatedMinutes,
    });
  } catch (err) {
    console.error("[Scan Request]", err);
    return NextResponse.json(
      { error: "Request failed", message: "Could not add scan request.", code: "REQUEST_FAILED" },
      { status: 500 }
    );
  }
}
