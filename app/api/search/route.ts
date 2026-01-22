import { NextResponse } from "next/server";
import { calculateViralityMultiplier, isOutlierVideo } from "@/lib/outlier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    // Get API key
    const API_KEY = process.env.YOUTUBE_API_KEY;
    if (!API_KEY) {
      return NextResponse.json(
        { error: "YouTube API key not configured" },
        { status: 500 }
      );
    }

    // Parse and validate query
    const url = new URL(req.url);
    const query = url.searchParams.get("q");
    
    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty query parameter" },
        { status: 400 }
      );
    }

    const trimmedQuery = query.trim();

    // Build YouTube Search API request
    const searchParams = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: "25",
      safeSearch: "none",
      q: trimmedQuery,
      key: API_KEY,
    });

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`;

    // 1. Search videos
    const searchRes = await fetch(searchUrl);
    
    if (!searchRes.ok) {
      const errorBody = await searchRes.text();
      let errorMessage = "Unable to search YouTube videos";
      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        // Use default error message if parsing fails
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: searchRes.status >= 400 && searchRes.status < 500 ? searchRes.status : 502 }
      );
    }

    const searchData = await searchRes.json();

    if (!searchData.items || searchData.items.length === 0) {
      return NextResponse.json([]);
    }

    // Extract video and channel IDs
    const videoIds = searchData.items
      .map((item: any) => item?.id?.videoId)
      .filter((id: any) => id && typeof id === "string")
      .join(",");

    const channelIds = [
      ...new Set(
        searchData.items
          .map((item: any) => item?.snippet?.channelId)
          .filter((id: any) => id && typeof id === "string")
      ),
    ].join(",");

    if (!videoIds || videoIds.length === 0) {
      return NextResponse.json([]);
    }

    // 2. Fetch video statistics
    const videoParams = new URLSearchParams({
      part: "statistics,snippet",
      id: videoIds,
      key: API_KEY,
    });

    const videoUrl = `https://www.googleapis.com/youtube/v3/videos?${videoParams.toString()}`;
    const videoRes = await fetch(videoUrl);

    if (!videoRes.ok) {
      const errorBody = await videoRes.text();
      let errorMessage = "Unable to fetch video statistics";
      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        // Use default error message if parsing fails
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: videoRes.status >= 400 && videoRes.status < 500 ? videoRes.status : 502 }
      );
    }

    const videoData = await videoRes.json();

    // 3. Fetch channel statistics
    if (!channelIds || channelIds.length === 0) {
      return NextResponse.json([]);
    }

    const channelParams = new URLSearchParams({
      part: "statistics",
      id: channelIds,
      key: API_KEY,
    });

    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?${channelParams.toString()}`;
    const channelRes = await fetch(channelUrl);

    if (!channelRes.ok) {
      const errorBody = await channelRes.text();
      let errorMessage = "Unable to fetch channel statistics";
      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        // Use default error message if parsing fails
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: channelRes.status >= 400 && channelRes.status < 500 ? channelRes.status : 502 }
      );
    }

    const channelData = await channelRes.json();

    // Map channel IDs to subscriber counts
    const channelMap: Record<string, number> = {};
    if (channelData.items && Array.isArray(channelData.items)) {
      channelData.items.forEach((ch: any) => {
        if (ch?.id && ch?.statistics?.subscriberCount !== undefined) {
          channelMap[ch.id] = Number(ch.statistics.subscriberCount || 0);
        }
      });
    }

    // Combine video and channel data, calculate multipliers, filter outliers
    const results = (videoData.items || [])
      .map((video: any) => {
        const channelId = video?.snippet?.channelId;
        const views = Number(video?.statistics?.viewCount || 0);
        const subscribers = channelMap[channelId] || 0;
        const multiplier = calculateViralityMultiplier(views, subscribers);

        return {
          id: video?.id,
          title: video?.snippet?.title || "",
          thumbnail: video?.snippet?.thumbnails?.medium?.url || "",
          channelTitle: video?.snippet?.channelTitle || "",
          views,
          subscribers,
          multiplier,
          outlier: isOutlierVideo(views, subscribers),
        };
      })
      .filter((v: any) => v.outlier);

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "An unexpected error occurred. Please try again later.",
      },
      { status: 500 }
    );
  }
}
