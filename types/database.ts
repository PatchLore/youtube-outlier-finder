/**
 * Database row types aligned with migrations 001–010.
 * Use these with lib/db query<T> so rows are correctly typed.
 */

/** videos table (003_create_videos, 009_add_videos_outlier_score) */
export interface Video {
  id: number;
  youtube_video_id: string;
  channel_id: number;
  title: string | null;
  thumbnail_url: string | null;
  views: number;
  published_at: string | null;
  multiplier: number | null;
  outlier_tier: string[] | null;
  views_per_day: number | null;
  like_ratio: number | null;
  created_at: string;
  updated_at: string;
  outlier_score: number | null;
}

/** keywords table (002, 007_add_keyword_niche_priority, 008_add_keywords_last_ingested_at) */
export interface Keyword {
  id: number;
  keyword: string;
  created_at: string;
  niche: string;
  priority: number;
  last_ingested_at: string | null;
}

/** users table (010_create_users) */
export interface User {
  id: number;
  clerk_user_id: string;
  stripe_customer_id: string | null;
  plan: "free" | "pro";
  created_at: string;
  updated_at: string;
}

/** channels table (001_create_channels) */
export interface Channel {
  id: number;
  youtube_channel_id: string;
  title: string | null;
  subscriber_count: number;
  created_at: string;
  updated_at: string;
}

/** ingestion_jobs table (005, 006) – for typed job inserts/updates */
export interface IngestionJob {
  id: number;
  status: string;
  job_type: string | null;
  query: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  quota_units_used: number;
}

/**
 * Row shape for search results: videos joined with channels (channel_title, subscriber_count).
 * outlier_score is present when plan is pro. Use with lib/db query<VideoSearchRow> in db-search.
 */
export type VideoSearchRow = Pick<
  Video,
  | "youtube_video_id"
  | "title"
  | "thumbnail_url"
  | "views"
  | "published_at"
  | "multiplier"
  | "views_per_day"
  | "like_ratio"
  | "outlier_tier"
> & { channel_title: string | null; subscriber_count: number; outlier_score?: number | null };
