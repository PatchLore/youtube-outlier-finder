import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { calculateViralityMultiplier, calculateViewsPerDay, calculateAverageLikeRatio, calculateNicheAverageMultiplier, classifyOutlier, isOutlierVideo, type OutlierOptions } from "@/lib/outlier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FREE_RESULT_LIMIT = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const MAX_QUERY_LENGTH = 100;

// In-memory rate limit store (per instance). Replace with durable store in production.
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  const realIp = req.headers.get("x-real-ip");
  return realIp?.trim() || "unknown";
}

// Niche analysis types for zero-result intelligence
export type NicheStatus = "SATURATED" | "QUIET" | "EMERGING" | "EVENT_DRIVEN" | "DECLINING";
export type DifficultyLevel = "BEGINNER" | "INTERMEDIATE" | "EXPERT";

export interface NicheAnalysis {
  nicheStatus: NicheStatus;
  scannedVideos: number;
  averageChannelSize: number;
  dominantChannelThreshold: number;
  explanation: string;
  difficultyLevel: DifficultyLevel;
  suggestedSearches: string[];
}

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

    // Rate limiting: apply after validation so invalid requests don't count.
    // Use per-user when authenticated, otherwise per-IP. Upgrade to KV/DB for multi-instance.
    // Only primary searches should count toward the limit (avoid background fetches).
    let rateLimitHeaders: Record<string, string> | null = null;
    const { userId } = await auth();
    const scope = url.searchParams.get("rateLimitScope") || "primary";
    const shouldRateLimit = scope === "primary";
    const baseKey = userId ? `user:${userId}` : `ip:${getClientIp(req)}`;
    const rateLimitKey = `${baseKey}:${scope}`;
    const now = Date.now();

    if (shouldRateLimit) {
      const existing = rateLimitStore.get(rateLimitKey);
      let currentCount = 1;
      let windowStart = now;

      if (!existing || now - existing.windowStart >= RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.set(rateLimitKey, { count: 1, windowStart: now });
      } else if (existing.count >= RATE_LIMIT_MAX) {
        const remainingSeconds = Math.max(
          0,
          Math.ceil((RATE_LIMIT_WINDOW_MS - (now - existing.windowStart)) / 1000)
        );
        rateLimitHeaders = {
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
          "X-RateLimit-Remaining": "0",
          "Retry-After": String(remainingSeconds),
        };
        console.log(
          `[RateLimit] ${baseKey} | Count: ${existing.count}/${RATE_LIMIT_MAX} | Trigger: ${scope} | BLOCKED`
        );
        return NextResponse.json(
          { error: "Too many requests. Please wait a minute and try again." },
          { status: 429, headers: rateLimitHeaders }
        );
      } else {
        existing.count += 1;
        currentCount = existing.count;
        windowStart = existing.windowStart;
      }

      const remaining = Math.max(0, RATE_LIMIT_MAX - currentCount);
      rateLimitHeaders = {
        "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
        "X-RateLimit-Remaining": String(remaining),
      };
      console.log(
        `[RateLimit] ${baseKey} | Count: ${currentCount}/${RATE_LIMIT_MAX} | Trigger: ${scope}`
      );
    }

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
      // Quota or upstream errors should be sanitized for clients.
      const safeMessage = "Search temporarily unavailable. Please try again later.";
      const statusCode = searchRes.status >= 500 ? 502 : searchRes.status;
      return NextResponse.json({ error: safeMessage }, { status: statusCode });
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
      // Quota or upstream errors should be sanitized for clients.
      const safeMessage = "Search temporarily unavailable. Please try again later.";
      const statusCode = videoRes.status >= 500 ? 502 : videoRes.status;
      return NextResponse.json({ error: safeMessage }, { status: statusCode });
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
      // Quota or upstream errors should be sanitized for clients.
      const safeMessage = "Search temporarily unavailable. Please try again later.";
      const statusCode = channelRes.status >= 500 ? 502 : channelRes.status;
      return NextResponse.json({ error: safeMessage }, { status: statusCode });
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

    // Identify Rising Signals: videos with 2.0-2.9× multiplier (early momentum, not full breakouts)
    // These are separate from main results and near-misses
    const risingSignals = allVideos
      .filter((v: any) => {
        // Must meet view floor
        if (v.views < 1_000) return false;
        
        // Must be in the 2.0-2.9× range (not a full breakout)
        if (v.multiplier < 2.0 || v.multiplier >= 3.0) return false;

        // Must beat channel average
        if (v.multiplier <= 1) return false;

        // For momentum mode, respect date threshold (60 days)
        if (isMomentumMode && momentumDateThreshold && v.publishedAt) {
          const publishedDate = new Date(v.publishedAt);
          if (publishedDate < momentumDateThreshold) {
            return false;
          }
        }

        // Exclude videos that are already in results (strict outliers)
        return !v.outlier;
      })
      .sort((a: any, b: any) => b.multiplier - a.multiplier) // Sort by multiplier descending
      .slice(0, 10); // Limit to top 10 rising signals

    // Compute niche analysis when no breakouts are found
    // This provides intelligence about why no results appeared, turning empty states into insights
    let nicheAnalysis: NicheAnalysis | null = null;
    if (results.length === 0 && allVideos.length > 0) {
      // Calculate average channel size from all scanned videos
      const validSubscribers = allVideos
        .map((v: any) => v.subscribers)
        .filter((subs: number) => subs > 0);
      const averageChannelSize = validSubscribers.length > 0
        ? Math.round(validSubscribers.reduce((sum: number, s: number) => sum + s, 0) / validSubscribers.length)
        : 0;

      // Calculate dominant channel threshold (median channel size)
      const sortedSubs = [...validSubscribers].sort((a, b) => a - b);
      const dominantChannelThreshold = sortedSubs.length > 0
        ? sortedSubs[Math.floor(sortedSubs.length / 2)]
        : 0;

      // Calculate max multiplier to check saturation
      const maxMultiplier = allVideos.length > 0
        ? Math.max(...allVideos.map((v: any) => v.multiplier))
        : 0;

      // Calculate multiplier variance for emerging detection
      const multipliers = allVideos.map((v: any) => v.multiplier);
      const avgMultiplier = multipliers.reduce((sum: number, m: number) => sum + m, 0) / multipliers.length;
      const variance = multipliers.reduce((sum: number, m: number) => sum + Math.pow(m - avgMultiplier, 2), 0) / multipliers.length;
      const multiplierVariance = Math.sqrt(variance);

      // Check upload velocity (videos published in last 30 days)
      const now = new Date();
      const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const recentVideos = allVideos.filter((v: any) => {
        if (!v.publishedAt) return false;
        const publishedDate = new Date(v.publishedAt);
        return publishedDate >= days30Ago;
      });
      const uploadVelocity = recentVideos.length / allVideos.length;

      // Check for event-driven keywords (gaming, tech)
      const lowerQuery = trimmedQuery.toLowerCase();
      const isEventDriven = /(gaming|game|tech|technology|ai|artificial intelligence|release|update|launch)/.test(lowerQuery);

      // Check for bursty upload dates (multiple videos on same day)
      const publishDates = allVideos
        .map((v: any) => v.publishedAt ? new Date(v.publishedAt).toDateString() : null)
        .filter((d: string | null): d is string => d !== null);
      const dateCounts = publishDates.reduce((acc: Record<string, number>, date: string) => {
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});
      const dateCountValues = Object.values(dateCounts) as number[];
      const maxVideosPerDay = dateCountValues.length > 0 ? Math.max(...dateCountValues) : 0;
      const isBursty = maxVideosPerDay >= 3;

      // Check for declining (low volume + no breakout in 90+ days)
      const days90Ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const recentBreakouts = allVideos.filter((v: any) => {
        if (!v.publishedAt) return false;
        const publishedDate = new Date(v.publishedAt);
        return publishedDate >= days90Ago && v.multiplier >= 2.5;
      });
      const isDeclining = allVideos.length < 10 && recentBreakouts.length === 0;

      // Classify niche status based on computed metrics
      let nicheStatus: NicheStatus;
      let explanation: string;
      let difficultyLevel: DifficultyLevel;

      if (averageChannelSize > 50_000 && maxMultiplier < 2.5) {
        nicheStatus = "SATURATED";
        explanation = `We scanned ${allVideos.length} recent videos from channels averaging ${averageChannelSize.toLocaleString()} subscribers. None exceeded 2.5× multiplier, indicating high competition and established players. This niche is currently dominated by larger channels.`;
        difficultyLevel = "EXPERT";
      } else if (averageChannelSize < 20_000 && uploadVelocity < 0.3) {
        nicheStatus = "QUIET";
        explanation = `We scanned ${allVideos.length} videos from small channels (avg ${averageChannelSize.toLocaleString()} subscribers) with low recent activity. This pattern suggests either an untapped opportunity or a seasonal lull. Low competition may present an entry window.`;
        difficultyLevel = averageChannelSize < 10_000 ? "BEGINNER" : "INTERMEDIATE";
      } else if (averageChannelSize < 10_000 && multiplierVariance > 1.0) {
        nicheStatus = "EMERGING";
        explanation = `We scanned ${allVideos.length} videos from small channels (avg ${averageChannelSize.toLocaleString()} subscribers) with high performance variance. Some videos are gaining traction, suggesting early-stage opportunity. This niche shows signs of emerging momentum.`;
        difficultyLevel = "BEGINNER";
      } else if (isEventDriven && isBursty) {
        nicheStatus = "EVENT_DRIVEN";
        explanation = `We scanned ${allVideos.length} videos with bursty upload patterns. This niche is event-driven, meaning timing and speed matter more than channel size. Breakouts here are tied to external events or releases.`;
        difficultyLevel = "INTERMEDIATE";
      } else if (isDeclining) {
        nicheStatus = "DECLINING";
        explanation = `We scanned ${allVideos.length} videos with low volume and no recent breakouts. This niche may be past its peak or require a fresh angle. Historical performance suggests declining momentum.`;
        difficultyLevel = "EXPERT";
      } else {
        // Default to QUIET if no specific pattern matches
        nicheStatus = "QUIET";
        explanation = `We scanned ${allVideos.length} recent videos. No clear breakout patterns detected. This could indicate low competition (opportunity) or a niche in transition (caution).`;
        difficultyLevel = averageChannelSize < 20_000 ? "BEGINNER" : "INTERMEDIATE";
      }

      // Generate suggested searches based on query
      const suggestedSearches: string[] = [];
      const words = trimmedQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      
      // Core topic (strip adjectives and years)
      const coreWords = words.filter(w => !/^(best|top|new|latest|2024|2025|review|reviews)$/.test(w));
      if (coreWords.length > 0) {
        suggestedSearches.push(coreWords.join(" "));
      }

      // Format angle variations
      if (!words.includes("shorts")) {
        suggestedSearches.push(`${coreWords.slice(0, 2).join(" ")} shorts`);
      }
      if (!words.includes("tutorial")) {
        suggestedSearches.push(`${coreWords[0]} tutorial`);
      }

      // Adjacent niche (simple synonym-based)
      if (words.includes("productivity")) {
        suggestedSearches.push("Notion alternatives");
      } else if (words.includes("ai") || words.includes("artificial")) {
        suggestedSearches.push("AI tools for creators");
      } else if (words.includes("gaming") || words.includes("game")) {
        suggestedSearches.push("gaming challenge");
      }

      // Limit to 3 suggestions
      nicheAnalysis = {
        nicheStatus,
        scannedVideos: allVideos.length,
        averageChannelSize,
        dominantChannelThreshold,
        explanation,
        difficultyLevel,
        suggestedSearches: suggestedSearches.slice(0, 3),
      };
    }

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

    // Add metadata to rising signals with confidenceTier = "RISING"
    const risingSignalsWithMetadata = risingSignals.map((video: any) => {
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
        confidenceTier: "RISING" as const,
        outlierTier,
        nicheAverageMultiplier,
      };
    });

    // Return results with nearMisses, risingSignals, and/or nicheAnalysis if present
    const response: any = {
      results: resultsWithMetadata,
    };

    // Include near-misses if present
    if (nearMissesWithMetadata.length > 0) {
      response.nearMisses = nearMissesWithMetadata;
    }

    // Include rising signals if present (separate from main results)
    if (risingSignalsWithMetadata.length > 0) {
      response.risingSignals = risingSignalsWithMetadata;
    }

    // Include niche analysis when no breakouts found (provides intelligence about why)
    if (nicheAnalysis) {
      response.nicheAnalysis = nicheAnalysis;
    }

    const jsonResponse = NextResponse.json(response);
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        jsonResponse.headers.set(key, value);
      });
    }
    return jsonResponse;
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "An unexpected error occurred. Please try again later.",
      },
      { status: 500 }
    );
  }
}
