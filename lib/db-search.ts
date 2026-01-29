/**
 * User search: database-only. No YouTube API calls.
 * Results are shaped for the frontend (OutlierResult, nicheAnalysis, etc.).
 */

import { query } from "@/lib/db";
import {
  calculateNicheAverageMultiplier,
  calculateAverageLikeRatio,
  classifyOutlier,
} from "@/lib/outlier";

export type DbSearchMode = "momentum" | "proven";

type DbVideoRow = {
  youtube_video_id: string;
  title: string | null;
  thumbnail_url: string | null;
  views: number;
  published_at: string | null;
  multiplier: number | null;
  views_per_day: number | null;
  like_ratio: number | null;
  outlier_tier: string[] | null;
  channel_title: string | null;
  subscriber_count: number;
};

type OutlierResultShape = {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  views: number;
  subscribers: number;
  multiplier: number;
  outlier: boolean;
  publishedAt?: string | null;
  outlierTier?: string[] | null;
  viewsPerDay?: number | null;
  likeRatio?: number | null;
  nicheAverageMultiplier?: number | null;
  reason?: string | null;
  confidenceTier?: "BREAKOUT" | "RISING";
};

const MOMENTUM_STRICT_DAYS = 60;
const MOMENTUM_EXPANDED_DAYS = 90;
const STRICT_MULTIPLIER = 3;
const EXPANDED_MULTIPLIER = 2.5;
const RISING_MIN = 2.0;
const RISING_MAX = 2.99;
const NEAR_MISS_MIN = 2.5;
const NEAR_MISS_MAX = 2.99;

function rowToOutlier(
  row: DbVideoRow,
  opts: {
    nicheAverageMultiplier: number | null;
    nicheAverageLikeRatio: number | null;
    breakoutCount: number;
    isStrict: boolean;
  }
): OutlierResultShape {
  const multiplier = Number(row.multiplier) || 0;
  const subscribers = Number(row.subscriber_count) || 0;
  const publishedAt = row.published_at;
  const isFresh =
    publishedAt &&
    (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24) <= 30;
  const viewsPerDay = row.views_per_day != null ? Number(row.views_per_day) : null;
  const likeRatio = row.like_ratio != null ? Number(row.like_ratio) : null;

  const outlierTier = classifyOutlier({
    views: row.views,
    subscribers,
    viewsPerDay,
    likeRatio,
    nicheAverageMultiplier: opts.nicheAverageMultiplier,
    nicheAverageLikeRatio: opts.nicheAverageLikeRatio,
    breakoutCount: opts.breakoutCount,
    isFresh: Boolean(isFresh),
  });

  return {
    id: row.youtube_video_id,
    title: row.title ?? "",
    thumbnail: row.thumbnail_url ?? "",
    channelTitle: row.channel_title ?? "",
    views: row.views,
    subscribers,
    multiplier,
    outlier: opts.isStrict ? multiplier >= STRICT_MULTIPLIER : multiplier >= EXPANDED_MULTIPLIER,
    publishedAt: publishedAt ?? null,
    outlierTier: outlierTier.length > 0 ? outlierTier : (row.outlier_tier ?? null),
    viewsPerDay,
    likeRatio,
    nicheAverageMultiplier: opts.nicheAverageMultiplier,
  };
}

export type DbSearchResponse = {
  results: OutlierResultShape[];
  searchType: "strict" | "expanded";
  message?: string;
  strict: { minMultiplier: number; maxDays: number };
  expanded: { minMultiplier: number; maxDays: number };
  nearMisses?: (OutlierResultShape & { reason?: string })[];
  risingSignals?: OutlierResultShape[];
  nicheAnalysis?: {
    nicheStatus: string;
    scannedVideos: number;
    averageChannelSize: number;
    dominantChannelThreshold: number;
    explanation: string;
    difficultyLevel: string;
    suggestedSearches: string[];
  };
  recommendedAlternatives?: { query: string; count: number }[];
};

export async function searchFromDb(
  trimmedQuery: string,
  mode: DbSearchMode
): Promise<DbSearchResponse> {
  const escaped = trimmedQuery.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const searchPattern = `%${escaped}%`;
  const { rows } = await query<DbVideoRow>(
    `SELECT
       v.youtube_video_id,
       v.title,
       v.thumbnail_url,
       v.views,
       v.published_at,
       v.multiplier,
       v.views_per_day,
       v.like_ratio,
       v.outlier_tier,
       c.title AS channel_title,
       c.subscriber_count
     FROM videos v
     JOIN channels c ON c.id = v.channel_id
     JOIN video_keywords vk ON vk.video_id = v.id
     JOIN keywords k ON k.id = vk.keyword_id
     WHERE k.keyword ILIKE $1
     ORDER BY v.multiplier DESC NULLS LAST, v.published_at DESC NULLS LAST`,
    [searchPattern]
  );

  const now = new Date();
  const momentum60 = new Date(now.getTime() - MOMENTUM_STRICT_DAYS * 24 * 60 * 60 * 1000);
  const momentum90 = new Date(now.getTime() - MOMENTUM_EXPANDED_DAYS * 24 * 60 * 60 * 1000);

  const withDates = rows.map((r) => ({
    ...r,
    _published: r.published_at ? new Date(r.published_at) : null,
    _mult: Number(r.multiplier) || 0,
  }));

  const isMomentum = mode === "momentum";
  const strictCandidates = withDates.filter((r) => {
    if (r._mult < STRICT_MULTIPLIER) return false;
    if (isMomentum && r._published && r._published < momentum60) return false;
    return true;
  });
  const expandedCandidates = withDates.filter((r) => {
    if (r._mult < EXPANDED_MULTIPLIER) return false;
    if (isMomentum && r._published && r._published < momentum90) return false;
    return true;
  });

  let resultsRows = strictCandidates;
  let searchType: "strict" | "expanded" = "strict";
  if (strictCandidates.length === 0 && expandedCandidates.length > 0) {
    resultsRows = expandedCandidates;
    searchType = "expanded";
  }

  const multipliers = resultsRows.map((r) => r._mult).filter((m) => m > 0);
  const likeRatios = resultsRows.map((r) =>
    r.like_ratio != null ? Number(r.like_ratio) : null
  );
  const nicheAverageMultiplier = calculateNicheAverageMultiplier(multipliers, 10);
  const nicheAverageLikeRatio = calculateAverageLikeRatio(likeRatios);
  const breakoutCount = resultsRows.filter((r) => r._mult >= STRICT_MULTIPLIER).length;

  const results: OutlierResultShape[] = resultsRows.map((r) =>
    rowToOutlier(r, {
      nicheAverageMultiplier,
      nicheAverageLikeRatio,
      breakoutCount,
      isStrict: searchType === "strict",
    })
  );

  const nearMissesRows = withDates.filter((r) => {
    if (r._mult < NEAR_MISS_MIN || r._mult >= STRICT_MULTIPLIER) return false;
    if (isMomentum && r._published && r._published < momentum90) return false;
    return !resultsRows.some((x) => x.youtube_video_id === r.youtube_video_id);
  });
  const nearMisses: (OutlierResultShape & { reason?: string })[] = nearMissesRows
    .slice(0, 3)
    .map((r) => ({
      ...rowToOutlier(r, {
        nicheAverageMultiplier,
        nicheAverageLikeRatio,
        breakoutCount,
        isStrict: false,
      }),
      reason: `${r._mult.toFixed(1)}x_multiplier`,
    }));

  const risingRows = withDates.filter((r) => {
    if (r._mult < RISING_MIN || r._mult >= STRICT_MULTIPLIER) return false;
    if (isMomentum && r._published && r._published < momentum60) return false;
    return !resultsRows.some((x) => x.youtube_video_id === r.youtube_video_id);
  });
  const risingSignals = risingRows
    .slice(0, 10)
    .map((r) => {
      const out = rowToOutlier(r, {
        nicheAverageMultiplier,
        nicheAverageLikeRatio,
        breakoutCount,
        isStrict: false,
      });
      return { ...out, confidenceTier: "RISING" as const };
    });

  let nicheAnalysis: DbSearchResponse["nicheAnalysis"] | undefined;
  if (results.length === 0 && withDates.length > 0) {
    const subs = withDates.map((r) => Number(r.subscriber_count) || 0).filter((s) => s > 0);
    const avgChannelSize = subs.length ? Math.round(subs.reduce((a, b) => a + b, 0) / subs.length) : 0;
    const sorted = [...subs].sort((a, b) => a - b);
    const dominantThreshold = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    nicheAnalysis = {
      nicheStatus: "QUIET",
      scannedVideos: withDates.length,
      averageChannelSize: avgChannelSize,
      dominantChannelThreshold: dominantThreshold,
      explanation: `We have ${withDates.length} video(s) in the database for this niche. None meet the strict breakout threshold (3×+ in last 60 days). Try another keyword or check back after more ingestion.`,
      difficultyLevel: "BEGINNER",
      suggestedSearches: [trimmedQuery, `${trimmedQuery} shorts`].slice(0, 3),
    };
  }

  const response: DbSearchResponse = {
    results,
    searchType,
    message:
      searchType === "expanded"
        ? "No strict breakouts found. Showing expanded results (2.5×+, 90 days)."
        : undefined,
    strict: { minMultiplier: STRICT_MULTIPLIER, maxDays: MOMENTUM_STRICT_DAYS },
    expanded: { minMultiplier: EXPANDED_MULTIPLIER, maxDays: MOMENTUM_EXPANDED_DAYS },
  };
  if (nearMisses.length > 0) response.nearMisses = nearMisses;
  if (risingSignals.length > 0) response.risingSignals = risingSignals;
  if (nicheAnalysis) response.nicheAnalysis = nicheAnalysis;

  return response;
}
