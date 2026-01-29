import { calculateViralityMultiplier, calculateViewsPerDay } from "@/lib/outlier";

const FETCH_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchYouTubeSearch(
  apiKey: string,
  query: string,
  maxResults: number = 15
): Promise<{ videoIds: string[]; channelIds: string[]; items: any[] }> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: String(maxResults),
    safeSearch: "none",
    q: query,
    key: apiKey,
  });
  const res = await fetchWithTimeout(
    `https://www.googleapis.com/youtube/v3/search?${params}`
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube search failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const items = data.items || [];
  const videoIds = items
    .map((item: any) => item?.id?.videoId)
    .filter((id: any) => id && typeof id === "string");
  const channelIds = [
    ...new Set(
      items
        .map((item: any) => item?.snippet?.channelId)
        .filter((id: any) => id && typeof id === "string")
    ),
  ];
  return { videoIds, channelIds, items };
}

export async function fetchVideoDetails(
  apiKey: string,
  videoIds: string[]
): Promise<any[]> {
  if (videoIds.length === 0) return [];
  const params = new URLSearchParams({
    part: "statistics,snippet",
    id: videoIds.join(","),
    key: apiKey,
  });
  const res = await fetchWithTimeout(
    `https://www.googleapis.com/youtube/v3/videos?${params}`
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube videos failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.items || [];
}

export async function fetchChannelDetails(
  apiKey: string,
  channelIds: string[]
): Promise<Record<string, number>> {
  if (channelIds.length === 0) return {};
  const params = new URLSearchParams({
    part: "statistics",
    id: channelIds.join(","),
    key: apiKey,
  });
  const res = await fetchWithTimeout(
    `https://www.googleapis.com/youtube/v3/channels?${params}`
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube channels failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const channelMap: Record<string, number> = {};
  (data.items || []).forEach((ch: any) => {
    if (ch?.id && ch?.statistics?.subscriberCount !== undefined) {
      channelMap[ch.id] = Number(ch.statistics.subscriberCount || 0);
    }
  });
  return channelMap;
}

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

export function buildEnrichedVideos(
  videoItems: any[],
  channelMap: Record<string, number>
): EnrichedVideo[] {
  return videoItems.map((video: any) => {
    const channelId = video?.snippet?.channelId;
    const views = Number(video?.statistics?.viewCount || 0);
    const likes = Number(video?.statistics?.likeCount || 0);
    const subscribers = channelMap[channelId] ?? 0;
    const publishedAt = video?.snippet?.publishedAt || null;
    const multiplier = calculateViralityMultiplier(views, subscribers);
    const viewsPerDay = calculateViewsPerDay(views, publishedAt);
    const likeRatio =
      views > 0 && likes > 0 ? likes / views : null;

    return {
      youtube_video_id: video?.id ?? "",
      youtube_channel_id: channelId ?? "",
      channel_title: video?.snippet?.channelTitle ?? null,
      title: video?.snippet?.title ?? null,
      thumbnail_url: video?.snippet?.thumbnails?.medium?.url ?? null,
      views,
      subscribers,
      published_at: publishedAt,
      multiplier,
      views_per_day: viewsPerDay,
      like_ratio: likeRatio,
    };
  });
}
