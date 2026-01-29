import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This route intentionally does NOT call the YouTube API.
// It returns a static demo payload so new users can always
// see a successful "breakout" state, even if quota is exhausted.

export async function GET() {
  const query = "Faceless history shorts";

  const results = [
    {
      id: "demo1",
      title: "Faceless History Shorts That Blew Up Overnight",
      thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      channelTitle: "History Sparks",
      views: 52000,
      subscribers: 10000,
      multiplier: 5.2,
      outlier: true,
      publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      outlierTier: ["breakout"],
      confidenceTier: "BREAKOUT",
      viewsPerDay: 7400,
      likeRatio: 0.06,
      nicheAverageMultiplier: 1.4,
    },
    {
      id: "demo2",
      title: "5 Weird History Facts That Feel Made Up",
      thumbnail: "https://img.youtube.com/vi/9bZkp7q19f0/hqdefault.jpg",
      channelTitle: "Timeline Tales",
      views: 38000,
      subscribers: 9000,
      multiplier: 4.2,
      outlier: true,
      publishedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      outlierTier: ["breakout"],
      confidenceTier: "BREAKOUT",
      viewsPerDay: 3160,
      likeRatio: 0.055,
      nicheAverageMultiplier: 1.4,
    },
    {
      id: "demo3",
      title: "The Short That Turned My History Channel Around",
      thumbnail: "https://img.youtube.com/vi/3JZ_D3ELwOQ/hqdefault.jpg",
      channelTitle: "Silent Centuries",
      views: 29000,
      subscribers: 6000,
      multiplier: 4.8,
      outlier: true,
      publishedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      outlierTier: ["breakout"],
      confidenceTier: "BREAKOUT",
      viewsPerDay: 1450,
      likeRatio: 0.058,
      nicheAverageMultiplier: 1.4,
    },
    {
      id: "demo4",
      title: "Faceless History Hooks That Actually Work",
      thumbnail: "https://img.youtube.com/vi/l482T0yNkeo/hqdefault.jpg",
      channelTitle: "Hooked on History",
      views: 31000,
      subscribers: 8000,
      multiplier: 3.9,
      outlier: true,
      publishedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      outlierTier: ["breakout"],
      confidenceTier: "BREAKOUT",
      viewsPerDay: 2060,
      likeRatio: 0.052,
      nicheAverageMultiplier: 1.4,
    },
  ];

  const nicheAnalysis = {
    nicheStatus: "EMERGING",
    scannedVideos: 25,
    averageChannelSize: 8500,
    dominantChannelThreshold: 50000,
    averageMultiplier: 2.1,
    topMultiplier: 5.2,
    explanation:
      "Faceless history shorts are showing consistent breakout behavior from small channels.",
    difficultyLevel: "INTERMEDIATE",
    suggestedSearches: [
      "Faceless history hooks",
      "History shorts for beginners",
      "Story-driven history facts",
    ],
  };

  return NextResponse.json({
    query,
    results,
    nicheAnalysis,
  });
}
