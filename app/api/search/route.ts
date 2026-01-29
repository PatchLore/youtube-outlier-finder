import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { Redis } from "@upstash/redis";
import { getPool, query, type User } from "@/lib/db";
import { searchFromDb, type DbSearchPlan } from "@/lib/db-search";

/**
 * User-facing search: database only. No YouTube API calls.
 * Results are cached in KV. Populated by background ingestion (/api/cron/ingest).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;
const MAX_QUERY_LENGTH = 100;
const SEARCH_CACHE_TTL_SECONDS = 60 * 60 * 6;

const rateLimitStore = new Map<string, { count: number; windowStart: number }>();
const redis = (() => {
  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
})();

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  const realIp = req.headers.get("x-real-ip");
  return realIp?.trim() || "unknown";
}

/** True if the error is likely DB connection / unavailable (return 503). */
function isDbUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
  const lower = (msg + " " + code).toLowerCase();
  return (
    /DATABASE_URL|connection refused|ECONNREFUSED|ETIMEDOUT|connection terminated|connect ECONNREFUSED|connect ETIMEDOUT|timeout|does not exist|relation .* does not exist|no such table/i.test(lower) ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "57P01" || // admin shutdown
    code === "57P03"    // cannot connect now
  );
}

/** Log full error and stack server-side only; never send stack to client. */
function logSearchError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : undefined;
  console.error("[Search API Error]", context, { message: msg, code });
  if (stack) console.error("[Search API Error] stack:", stack);
}

const DB_OFFLINE_BODY = { error: "Database temporarily unavailable", type: "DB_OFFLINE" } as const;

function dbOfflineResponse() {
  return NextResponse.json(DB_OFFLINE_BODY, { status: 503 });
}

/** Resolve user plan from Clerk + users table; default 'free'. */
async function getPlanForRequest(_req: Request): Promise<DbSearchPlan> {
  try {
    const { userId } = await auth();
    if (!userId) return "free";
    const pool = getPool();
    if (!pool) return "free";
    const { rows } = await query<Pick<User, "plan">>(
      `SELECT plan FROM users WHERE clerk_user_id = $1 LIMIT 1`,
      [userId]
    );
    const plan = rows[0]?.plan;
    return plan === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}

export type NicheStatus = "SATURATED" | "QUIET" | "EMERGING" | "EVENT_DRIVEN" | "DECLINING";
export type DifficultyLevel = "BEGINNER" | "INTERMEDIATE" | "EXPERT";

export interface NicheAnalysis {
  nicheStatus: NicheStatus;
  scannedVideos: number;
  averageChannelSize: number;
  dominantChannelThreshold: number;
  averageMultiplier?: number;
  topMultiplier?: number;
  explanation: string;
  difficultyLevel: DifficultyLevel;
  suggestedSearches: string[];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q");
    const trimmedQuery = query ? query.trim() : "";

    if (trimmedQuery.length === 0) {
      return NextResponse.json(
        { error: "Search query cannot be empty." },
        { status: 400 }
      );
    }
    if (trimmedQuery.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        { error: `Search query must be ${MAX_QUERY_LENGTH} characters or less.` },
        { status: 400 }
      );
    }

    const mode = (url.searchParams.get("mode") || "momentum") as "momentum" | "proven";
    const plan = await getPlanForRequest(req);
    const searchTerm = trimmedQuery.toLowerCase();
    // Plan in key so Pro results are never served to Free users from cache
    const cacheKey = `search:query:${searchTerm}:plan:${plan}:mode:${mode}`;

    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        const cachedResponse = NextResponse.json(cached);
        cachedResponse.headers.set("X-Cache", "HIT");
        setCorsHeaders(cachedResponse);
        return cachedResponse;
      }
    } catch {
      // Ignore cache failures
    }

    let rateLimitHeaders: Record<string, string> | null = null;
    const scope = url.searchParams.get("rateLimitScope") || "primary";
    const shouldRateLimit = scope === "primary" && process.env.NODE_ENV !== "development";
    const baseKey = `ip:${getClientIp(req)}`;
    const rateLimitKey = `${baseKey}:${scope}`;
    const now = Date.now();

    if (shouldRateLimit) {
      try {
        if (redis) {
          const redisKey = `ratelimit:${rateLimitKey}`;
          const currentCount = await redis.incr(redisKey);
          if (currentCount === 1) {
            await redis.expire(redisKey, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
          }
          if (currentCount > RATE_LIMIT_MAX) {
            rateLimitHeaders = {
              "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
              "X-RateLimit-Remaining": "0",
              "Retry-After": String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
            };
            return NextResponse.json(
              { error: "Too many requests. Please wait a minute and try again." },
              { status: 429, headers: rateLimitHeaders }
            );
          }
          rateLimitHeaders = {
            "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
            "X-RateLimit-Remaining": String(Math.max(0, RATE_LIMIT_MAX - currentCount)),
          };
        } else {
          const existing = rateLimitStore.get(rateLimitKey);
          if (existing && now - existing.windowStart < RATE_LIMIT_WINDOW_MS) {
            if (existing.count >= RATE_LIMIT_MAX) {
              rateLimitHeaders = {
                "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
                "X-RateLimit-Remaining": "0",
                "Retry-After": String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
              };
              return NextResponse.json(
                { error: "Too many requests. Please wait a minute and try again." },
                { status: 429, headers: rateLimitHeaders }
              );
            }
            existing.count += 1;
          } else {
            rateLimitStore.set(rateLimitKey, { count: 1, windowStart: now });
          }
        }
      } catch {
        // Allow on rate limit failure
      }
    }

    const pool = getPool();
    if (!pool) {
      return dbOfflineResponse();
    }

    let response: Awaited<ReturnType<typeof searchFromDb>>;
    try {
      response = await searchFromDb(trimmedQuery, mode, { plan });
    } catch (dbErr) {
      logSearchError("searchFromDb threw", dbErr);
      if (isDbUnavailableError(dbErr)) {
        return NextResponse.json(DB_OFFLINE_BODY, { status: 503 });
      }
      return NextResponse.json(
        { error: "An unexpected error occurred. Please try again later." },
        { status: 500 }
      );
    }

    const jsonResponse = NextResponse.json(response);
    setCorsHeaders(jsonResponse);
    jsonResponse.headers.set("X-Cache", "MISS");
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => jsonResponse.headers.set(k, v));
    }

    try {
      await kv.set(cacheKey, response, { ex: SEARCH_CACHE_TTL_SECONDS });
    } catch {
      // Ignore cache write failures
    }

    return jsonResponse;
  } catch (err) {
    logSearchError("outer catch", err);
    if (isDbUnavailableError(err)) {
      return NextResponse.json(DB_OFFLINE_BODY, { status: 503 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again later." },
      { status: 500 }
    );
  }
}

function setCorsHeaders(res: NextResponse): void {
  res.headers.set("Access-Control-Allow-Origin", "https://www.outlieryt.com");
  res.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
