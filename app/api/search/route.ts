import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { Redis } from "@upstash/redis";
import { getPool } from "@/lib/db";
import { searchFromDb } from "@/lib/db-search";

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
    const cacheKey = `search:${mode}:${trimmedQuery.toLowerCase()}`;

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
      return NextResponse.json(
        { error: "Search temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }

    const response = await searchFromDb(trimmedQuery, mode);
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
    console.error("[Search API Error]:", err);
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
