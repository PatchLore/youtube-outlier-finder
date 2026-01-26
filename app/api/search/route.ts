import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { calculateViralityMultiplier, calculateViewsPerDay, calculateAverageLikeRatio, calculateNicheAverageMultiplier, classifyOutlier, isOutlierVideo, type OutlierOptions } from "@/lib/outlier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FREE_RESULT_LIMIT = 5;

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

    // Check if user is Pro
    const { userId } = await auth();
    let isPro = false;
    
    if (userId) {
      try {
        const { clerkClient } = await import("@clerk/nextjs/server");
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        isPro = user.publicMetadata?.plan === "pro";
      } catch {
        // If Clerk lookup fails, treat as free user
        isPro = false;
      }
    }

    // Parse mode query parameter (default to "momentum")
    const mode = url.searchParams.get("mode") || "momentum";
    const isMomentumMode = mode === "momentum";

    // Parse optional freshness/velocity options from query params
    const maxDaysOld = url.searchParams.get("maxDaysOld");
    const useVelocity = url.searchParams.get("useVelocity") === "true";
    
    const outlierOptions: OutlierOptions | undefined = 
      maxDaysOld || useVelocity
        ? {
            maxDaysOld: maxDaysOld ? Number(maxDaysOld) : undefined,
            useVelocityWeighting: useVelocity,
          }
        : undefined;

    // Calculate date threshold for momentum mode (60 days ago)
    const momentumDateThreshold = isMomentumMode
      ? new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      : null;

    // Combine video and channel data, calculate multipliers, filter outliers
    const allVideos = (videoData.items || [])
      .map((video: any) => {
        const channelId = video?.snippet?.channelId;
        const views = Number(video?.statistics?.viewCount || 0);
        const likes = Number(video?.statistics?.likeCount || 0);
        const subscribers = channelMap[channelId] || 0;
        const publishedAt = video?.snippet?.publishedAt;
        const multiplier = calculateViralityMultiplier(views, subscribers);
        const viewsPerDay = calculateViewsPerDay(views, publishedAt);
        
        // Calculate like ratio (likes / views), safe for missing likes
        const likeRatio = views > 0 && likes > 0 ? likes / views : null;

        return {
          id: video?.id,
          title: video?.snippet?.title || "",
          thumbnail: video?.snippet?.thumbnails?.medium?.url || "",
          channelTitle: video?.snippet?.channelTitle || "",
          views,
          subscribers,
          multiplier,
          viewsPerDay: viewsPerDay || null,
          likeRatio: likeRatio || null,
          outlier: isOutlierVideo(views, subscribers, publishedAt, outlierOptions),
          publishedAt: publishedAt || null,
        };
      });

    // Calculate average like ratio for relative engagement comparison
    const likeRatios = allVideos.map((v: any) => v.likeRatio);
    const nicheAverageLikeRatio = calculateAverageLikeRatio(likeRatios);

    // Calculate average multiplier for top results (for niche-relative outlier detection)
    const multipliers = allVideos.map((v: any) => v.multiplier);
    const nicheAverageMultiplier = calculateNicheAverageMultiplier(multipliers);

    // Filter strict outliers
    const results = allVideos.filter((v: any) => {
      // Filter by date for momentum mode
      if (isMomentumMode && momentumDateThreshold && v.publishedAt) {
        const publishedDate = new Date(v.publishedAt);
        if (publishedDate < momentumDateThreshold) {
          return false;
        }
      }
      return v.outlier;
    });

    // Count breakouts (videos with multiplier >= 3)
    const breakoutCount = results.filter((v: any) => v.multiplier >= 3).length;

    // Detect near-misses if strict results are empty
    let nearMisses: any[] = [];
    if (results.length === 0) {
      const now = new Date();
      const days45Ago = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
      const days31Ago = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);

      nearMisses = allVideos
        .filter((v: any) => {
          // Must meet view floor
          if (v.views < 1_000) return false;
          
          // Must beat channel average
          if (v.multiplier <= 1) return false;

          // For momentum mode, still respect a relaxed date threshold (45 days)
          if (isMomentumMode && v.publishedAt) {
            const publishedDate = new Date(v.publishedAt);
            if (publishedDate < days45Ago) {
              return false;
            }
          }

          // Check if it's a near-miss: multiplier between 2.5× and 2.99×
          const isMultiplierNearMiss = v.multiplier >= 2.5 && v.multiplier < 3.0;

          // Check if it's a near-miss: published between 31–45 days ago (momentum mode only)
          let isDateNearMiss = false;
          if (isMomentumMode && v.publishedAt) {
            const publishedDate = new Date(v.publishedAt);
            if (publishedDate >= days45Ago && publishedDate < days31Ago) {
              isDateNearMiss = true;
            }
          }

          return isMultiplierNearMiss || isDateNearMiss;
        })
        .slice(0, 3) // Limit to max 3
        .map((v: any) => {
          // Determine reason
          let reason: string;
          
          // Check multiplier near-miss first
          if (v.multiplier >= 2.5 && v.multiplier < 3.0) {
            reason = `${v.multiplier.toFixed(1)}x_multiplier`;
          } else if (isMomentumMode && v.publishedAt) {
            // Check date near-miss
            const publishedDate = new Date(v.publishedAt);
            const daysAgo = Math.floor((now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysAgo >= 31 && daysAgo <= 45) {
              reason = `published_${daysAgo}_days_ago`;
            } else {
              reason = "near_miss";
            }
          } else {
            reason = "near_miss";
          }

          return {
            id: v.id,
            title: v.title,
            thumbnail: v.thumbnail,
            channelTitle: v.channelTitle,
            views: v.views,
            subscribers: v.subscribers,
            multiplier: v.multiplier,
            viewsPerDay: v.viewsPerDay || null,
            likeRatio: v.likeRatio || null,
            publishedAt: v.publishedAt,
            reason,
          };
        });
    }

    // Limit results for free users
    const limitedResults = isPro ? results : results.slice(0, FREE_RESULT_LIMIT);

    // Add outlier tier metadata and additional fields to each result
    const resultsWithMetadata = limitedResults.map((video: any) => {
      // Determine if video is fresh (within 30 days)
      const isFresh = video.publishedAt ? (() => {
        const publishedDate = new Date(video.publishedAt);
        const daysSincePublished = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSincePublished <= 30;
      })() : false;

      // Classify outlier tier
      const outlierTier = classifyOutlier({
        views: video.views,
        subscribers: video.subscribers,
        viewsPerDay: video.viewsPerDay,
        likeRatio: video.likeRatio,
        nicheAverageMultiplier,
        nicheAverageLikeRatio,
        breakoutCount,
        isFresh,
      });

      return {
        ...video,
        outlierTier,
        nicheAverageMultiplier,
      };
    });

    // Add metadata to near-misses if present
    const nearMissesWithMetadata = nearMisses.length > 0
      ? nearMisses.map((video: any) => {
          const isFresh = video.publishedAt ? (() => {
            const publishedDate = new Date(video.publishedAt);
            const daysSincePublished = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
            return daysSincePublished <= 30;
          })() : false;

          const outlierTier = classifyOutlier({
            views: video.views,
            subscribers: video.subscribers,
            viewsPerDay: video.viewsPerDay || null,
            likeRatio: video.likeRatio || null,
            nicheAverageMultiplier,
            nicheAverageLikeRatio,
            breakoutCount,
            isFresh,
          });

          return {
            ...video,
            outlierTier,
            nicheAverageMultiplier,
          };
        })
      : [];

    // Return results with nearMisses if present
    if (nearMissesWithMetadata.length > 0) {
      return NextResponse.json({
        results: resultsWithMetadata,
        nearMisses: nearMissesWithMetadata,
      });
    }
    return NextResponse.json(resultsWithMetadata);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "An unexpected error occurred. Please try again later.",
      },
      { status: 500 }
    );
  }
}
