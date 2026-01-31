/**
 * Client-side fetch for GET /api/videos with 401 (redirect to sign-in) and 403 (upgrade modal) handling.
 * Use with useUpgradeModal() so the caller can show the upgrade modal on 403.
 */

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

export type FetchVideosParams = {
  niche?: string;
  sort?: "outlier_score" | "views" | "published_at" | "multiplier";
  limit?: number;
  offset?: number;
  mode?: "breaking" | "proven";
};

export type FetchVideosOptions = {
  /** Called when response is 403 (Pro feature requested by Free user). Show upgrade modal instead of error toast. */
  on403?: (opts: {
    title: string;
    description: string;
    features: string[];
  }) => void;
};

const DEFAULT_403_OPTS = {
  title: "Pro Feature Required",
  description: "Sorting by Outlier Score and viewing 100 results requires Pro.",
  features: ["Advanced sorting", "100 results per page", "Historical data"],
};

/**
 * Fetch videos from GET /api/videos. Handles 401 (redirect to sign-in with return URL) and 403 (calls on403 for upgrade modal).
 * @returns Promise<VideosApiResponse | undefined> — undefined when 401 (redirect) or 403 (caller shows modal)
 */
export async function fetchVideos(
  params: FetchVideosParams,
  options?: FetchVideosOptions
): Promise<VideosApiResponse | undefined> {
  const search = new URLSearchParams();
  if (params.niche != null) search.set("niche", params.niche);
  if (params.sort != null) search.set("sort", params.sort);
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  if (params.mode != null) search.set("mode", params.mode);

  const res = await fetch(`/api/videos?${search.toString()}`);

  if (res.status === 401) {
    window.location.href = `/sign-in?redirect=${encodeURIComponent(window.location.href)}`;
    return undefined;
  }

  if (res.status === 403) {
    options?.on403?.(DEFAULT_403_OPTS);
    return undefined;
  }

  if (!res.ok) throw new Error("Failed to fetch videos");
  return res.json();
}
