/**
 * Shared types for ingestion providers.
 * Primary: YouTube Data API (user-facing + background).
 * Secondary: Scraper API (background ingestion only, never in /api/search).
 */

export type EnrichedVideo = {
  youtube_video_id: string;
  youtube_channel_id: string;
  channel_title: string | null;
  title: string | null;
  thumbnail_url: string | null;
  views: number;
  subscribers: number;
  published_at: string | null;
  multiplier: number;
  views_per_day: number | null;
  like_ratio: number | null;
};

export type SearchResult = {
  videos: EnrichedVideo[];
  /** YouTube API quota units consumed (primary only). 0 for scraper. */
  quotaUnitsUsed: number;
};

export type ProviderName = "youtube" | "scraper";

export interface IngestionProvider {
  readonly name: ProviderName;
  /** Returns enriched videos for the query. Used only in background ingestion. */
  searchAndEnrich(query: string): Promise<SearchResult>;
}
