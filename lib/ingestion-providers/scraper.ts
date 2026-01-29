import type { IngestionProvider, SearchResult, EnrichedVideo } from "./types";
import { calculateViralityMultiplier, calculateViewsPerDay } from "@/lib/outlier";

const FETCH_TIMEOUT_MS = 20_000;

/**
 * Scraper API provider — for background ingestion only.
 * Never use in user-facing endpoints (e.g. /api/search).
 *
 * Expects SCRAPER_API_KEY and optionally SCRAPER_API_URL.
 * Response contract: JSON with { items: Array<{ videoId, title, channelId?, channelTitle?, viewCount?, subscriberCount?, publishedAt?, thumbnailUrl? }> }
 */
function parseScraperItem(item: any): EnrichedVideo {
  const views = Number(item?.viewCount ?? item?.views ?? 0);
  const subscribers = Number(item?.subscriberCount ?? item?.subscribers ?? 0);
  const publishedAt = item?.publishedAt ?? item?.published_at ?? null;
  const multiplier = calculateViralityMultiplier(views, subscribers);
  const viewsPerDay = calculateViewsPerDay(views, publishedAt);
  const likes = Number(item?.likeCount ?? item?.likes ?? 0);
  const likeRatio = views > 0 && likes > 0 ? likes / views : null;

  return {
    youtube_video_id: String(item?.videoId ?? item?.id ?? ""),
    youtube_channel_id: String(item?.channelId ?? item?.channel_id ?? ""),
    channel_title: item?.channelTitle ?? item?.channel_title ?? null,
    title: item?.title ?? null,
    thumbnail_url: item?.thumbnailUrl ?? item?.thumbnail_url ?? null,
    views,
    subscribers,
    published_at: publishedAt,
    multiplier,
    views_per_day: viewsPerDay,
    like_ratio: likeRatio,
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function createScraperProvider(): IngestionProvider {
  return {
    name: "scraper",
    async searchAndEnrich(query: string): Promise<SearchResult> {
      const apiKey = process.env.SCRAPER_API_KEY;
      if (!apiKey) {
        throw new Error("SCRAPER_API_KEY is not set");
      }

      const base =
        process.env.SCRAPER_API_URL?.replace(/\/$/, "") ??
        "https://api.scraperapi.com/structured/youtube/search";
      const sep = base.includes("?") ? "&" : "?";
      const url = `${base}${sep}query=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}`;
      const res = await fetchWithTimeout(
        url,
        { method: "GET", headers: { Accept: "application/json" } }
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Scraper API failed: ${res.status} ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      const rawItems = Array.isArray(data?.items) ? data.items : data?.results ?? [];
      const videos = rawItems
        .map(parseScraperItem)
        .filter((v: EnrichedVideo) => v.youtube_video_id);

      return {
        videos,
        quotaUnitsUsed: 0,
      };
    },
  };
}

/**
 * Check if the Scraper provider is configured (for fallback in cron).
 */
export function isScraperConfigured(): boolean {
  return Boolean(process.env.SCRAPER_API_KEY);
}
