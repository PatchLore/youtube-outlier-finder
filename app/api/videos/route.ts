import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { getPool, query, type User } from "@/lib/db";

/**
 * GET /api/videos – list videos with filters. Auth required.
 * Plan from users table (Stripe-synced); no record = free.
 * 60-second KV cache for identical queries.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEOS_CACHE_TTL_SECONDS = 60;

const VALID_NICHES = [
  "Finance",
  "AI tools",
  "Ecommerce",
  "Fitness",
  "Content Creation",
] as const;
type Niche = (typeof VALID_NICHES)[number];

const VALID_SORTS = ["outlier_score", "views", "published_at", "multiplier"] as const;
type SortParam = (typeof VALID_SORTS)[number];

const FREE_LIMIT_MAX = 5;
const PRO_LIMIT_MAX = 100;
const FREE_PUBLISHED_DAYS = 14;
const BREAKING_DAYS = 60;

function isNiche(s: string | null): s is Niche {
  return s != null && VALID_NICHES.includes(s as Niche);
}

function isSort(s: string | null): s is SortParam {
  return s != null && VALID_SORTS.includes(s as SortParam);
}

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

export type VideosApiVideo = {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  views: number;
  published_at: string | null;
  multiplier: number | null;
  outlier_score: number | null;
  views_per_day: number | null;
  like_ratio: number | null;
  channel_title: string | null;
  subscriber_count: number;
};

export type VideosApiResponse = {
  videos: VideosApiVideo[];
  total: number;
  hasMore: boolean;
  plan: "free" | "pro";
};

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      {
        error: "Authentication required",
        message: "Please sign in to search for video outliers.",
        code: "AUTH_REQUIRED",
      },
      { status: 401 }
    );
  }

  const plan = await getPlanForUser(userId);

  const url = new URL(req.url);
  const nicheRaw = url.searchParams.get("niche");
  const niche: Niche | null = isNiche(nicheRaw) ? nicheRaw : null;
  const sortParam = url.searchParams.get("sort");
  const sort: SortParam = isSort(sortParam) ? sortParam : "published_at";
  const limitRaw = url.searchParams.get("limit");
  const limitNum = limitRaw != null ? parseInt(limitRaw, 10) : (plan === "pro" ? 20 : FREE_LIMIT_MAX);
  const limit = Math.min(
    Math.max(1, Number.isFinite(limitNum) ? limitNum : (plan === "pro" ? 20 : FREE_LIMIT_MAX)),
    plan === "pro" ? PRO_LIMIT_MAX : FREE_LIMIT_MAX
  );
  const offsetRaw = url.searchParams.get("offset");
  const offset = Math.max(0, Number.isFinite(Number(offsetRaw)) ? Number(offsetRaw) : 0);
  const mode = url.searchParams.get("mode") === "breaking" ? "breaking" : "proven";

  if (plan === "free") {
    if (sort !== "published_at") {
      return NextResponse.json(
        {
          error: "Pro subscription required",
          message: "Sorting by outlier score requires Pro. Upgrade to unlock advanced filters.",
          code: "PRO_REQUIRED",
          upgradeUrl: "/upgrade",
        },
        { status: 403 }
      );
    }
    const requestedLimit = limitRaw != null ? parseInt(limitRaw, 10) : FREE_LIMIT_MAX;
    if (Number.isFinite(requestedLimit) && requestedLimit > FREE_LIMIT_MAX) {
      return NextResponse.json(
        {
          error: "Pro subscription required",
          message: "Viewing more than 5 results requires Pro. Upgrade to unlock 100 results per page.",
          code: "PRO_REQUIRED",
          upgradeUrl: "/upgrade",
        },
        { status: 403 }
      );
    }
  }

  const effectiveSort = plan === "free" ? "published_at" : sort;
  const cacheKey = `videos:${niche ?? ""}:${effectiveSort}:${limit}:${offset}:${mode}:${plan}`;

  try {
    const cached = await kv.get<VideosApiResponse>(cacheKey);
    if (cached) {
      const res = NextResponse.json(cached);
      res.headers.set("X-Cache", "HIT");
      return res;
    }
  } catch {
    // Ignore cache failures
  }

  const pool = getPool();
  if (!pool) {
    return NextResponse.json(
      { error: "Database temporarily unavailable" },
      { status: 503 }
    );
  }

  const params: unknown[] = [];
  let paramIndex = 0;
  function nextParam(val: unknown): string {
    paramIndex += 1;
    params.push(val);
    return `$${paramIndex}`;
  }

  const needNicheJoin = niche != null;

  const orderColumn =
    effectiveSort === "outlier_score"
      ? "v.outlier_score DESC NULLS LAST"
      : effectiveSort === "views"
        ? "v.views DESC"
        : effectiveSort === "multiplier"
          ? "v.multiplier DESC NULLS LAST"
          : "v.published_at DESC NULLS LAST";

  const dateWhereParts: string[] = [];
  if (plan === "free") {
    dateWhereParts.push(`v.published_at > NOW() - INTERVAL '${FREE_PUBLISHED_DAYS} days'`);
  }
  if (mode === "breaking") {
    dateWhereParts.push(`v.published_at > NOW() - INTERVAL '${BREAKING_DAYS} days'`);
  }
  const dateWhereClause = dateWhereParts.length ? `WHERE ${dateWhereParts.join(" AND ")}` : "";

  let countSql: string;
  let listSql: string;
  let listParams: unknown[];

  if (needNicheJoin) {
    const subWhereNiche = [...dateWhereParts].map((s) => s.replace(/^v\./, "v2."));
    subWhereNiche.push(`k.niche = ${nextParam(niche!)}`);
    const subWhereClause = `WHERE ${subWhereNiche.join(" AND ")}`;
    countSql = `SELECT COUNT(DISTINCT v.id) AS total
      FROM videos v
      INNER JOIN video_keywords vk ON vk.video_id = v.id
      INNER JOIN keywords k ON k.id = vk.keyword_id
      ${subWhereClause}`;
    listParams = [...params, limit, offset];
    listSql = `SELECT
    v.youtube_video_id AS id,
    v.title,
    v.thumbnail_url,
    v.views,
    v.published_at,
    v.multiplier,
    v.outlier_score,
    v.views_per_day,
    v.like_ratio,
    c.title AS channel_title,
    c.subscriber_count
  FROM videos v
  INNER JOIN channels c ON c.id = v.channel_id
  WHERE v.id IN (
    SELECT v2.id FROM videos v2
    INNER JOIN video_keywords vk ON vk.video_id = v2.id
    INNER JOIN keywords k ON k.id = vk.keyword_id
    WHERE k.niche = $1${dateWhereParts.length ? ` AND ${dateWhereParts.map((s) => s.replace(/^v\./, "v2.")).join(" AND ")}` : ""}
  )
  ${dateWhereClause ? `AND ${dateWhereParts.join(" AND ")}` : ""}
  ORDER BY ${orderColumn}
  LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}`;
  } else {
    countSql = `SELECT COUNT(*) AS total FROM videos v ${dateWhereClause}`;
    listParams = [...params, limit, offset];
    listSql = `SELECT
    v.youtube_video_id AS id,
    v.title,
    v.thumbnail_url,
    v.views,
    v.published_at,
    v.multiplier,
    v.outlier_score,
    v.views_per_day,
    v.like_ratio,
    c.title AS channel_title,
    c.subscriber_count
  FROM videos v
  INNER JOIN channels c ON c.id = v.channel_id
  ${dateWhereClause}
  ORDER BY ${orderColumn}
  LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}`;
  }

  const countParams = needNicheJoin ? params : [];
  const { rows: countRows } = await query<{ total: string }>(countSql, countParams);
  const total = Math.max(0, parseInt(countRows[0]?.total ?? "0", 10));

  const { rows: listRows } = await query<{
    id: string;
    title: string | null;
    thumbnail_url: string | null;
    views: number;
    published_at: string | null;
    multiplier: number | null;
    outlier_score: number | null;
    views_per_day: number | null;
    like_ratio: number | null;
    channel_title: string | null;
    subscriber_count: number;
  }>(listSql, listParams);

  const videos: VideosApiVideo[] = listRows.map((r) => ({
    id: r.id,
    title: r.title,
    thumbnail_url: r.thumbnail_url,
    views: Number(r.views),
    published_at: r.published_at,
    multiplier: r.multiplier != null ? Number(r.multiplier) : null,
    outlier_score: r.outlier_score != null ? Number(r.outlier_score) : null,
    views_per_day: r.views_per_day != null ? Number(r.views_per_day) : null,
    like_ratio: r.like_ratio != null ? Number(r.like_ratio) : null,
    channel_title: r.channel_title,
    subscriber_count: Number(r.subscriber_count),
  }));

  const response: VideosApiResponse = {
    videos,
    total,
    hasMore: offset + videos.length < total,
    plan,
  };

  try {
    await kv.set(cacheKey, response, { ex: VIDEOS_CACHE_TTL_SECONDS });
  } catch {
    // Ignore cache write failures
  }

  const res = NextResponse.json(response);
  res.headers.set("X-Cache", "MISS");
  return res;
}
