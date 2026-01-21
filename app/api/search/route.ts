import { NextResponse } from "next/server";
import { calculateViralityMultiplier, isOutlierVideo } from "@/lib/outlier";

const API_KEY = process.env.YOUTUBE_API_KEY;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  if (!API_KEY) {
    console.error("[ERROR] YOUTUBE_API_KEY is undefined. Check your .env.local file.");
    return NextResponse.json(
      { 
        error: "YOUTUBE_API_KEY not configured. Please set YOUTUBE_API_KEY in your .env.local file and restart the dev server." 
      },
      { status: 500 }
    );
  }

  // 1️⃣ Search videos
  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=25&safeSearch=none&q=${encodeURIComponent(
      query
    )}&key=${API_KEY}`;
    const searchRes = await fetch(searchUrl);
    
    if (!searchRes.ok) {
      console.error(`YouTube Search API error: ${searchRes.status} ${searchRes.statusText}`);
      return NextResponse.json(
        { error: "Unable to search YouTube videos. Please try again later." },
        { status: 500 }
      );
    }

    const searchData = await searchRes.json();

    if (!searchData.items || searchData.items.length === 0) {
      return NextResponse.json([]);
    }

    const videoIds = searchData.items.map((i: any) => i.id.videoId).join(",");
    const channelIds = [
      ...new Set(searchData.items.map((i: any) => i.snippet.channelId)),
    ].join(",");

    // 2️⃣ Fetch video stats
    const videoRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${API_KEY}`
    );
    
    if (!videoRes.ok) {
      console.error(`YouTube Videos API error: ${videoRes.status} ${videoRes.statusText}`);
      return NextResponse.json(
        { error: "Unable to fetch video statistics. Please try again later." },
        { status: 500 }
      );
    }

    const videoData = await videoRes.json();

    // 3️⃣ Fetch channel stats (THIS IS THE KEY PART)
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds}&key=${API_KEY}`
    );
    
    if (!channelRes.ok) {
      console.error(`YouTube Channels API error: ${channelRes.status} ${channelRes.statusText}`);
      return NextResponse.json(
        { error: "Unable to fetch channel statistics. Please try again later." },
        { status: 500 }
      );
    }

    const channelData = await channelRes.json();

    // 4️⃣ Map channel → subscriber count
    const channelMap: Record<string, number> = {};
    channelData.items?.forEach((ch: any) => {
      channelMap[ch.id] = Number(ch.statistics.subscriberCount || 0);
    });

    // 5️⃣ Combine + filter outliers
    const results = videoData.items?.map((video: any) => {
      const channelId = video.snippet.channelId;
      const views = Number(video.statistics.viewCount);
      const subscribers = channelMap[channelId] || 0;
      const multiplier = calculateViralityMultiplier(views, subscribers);

      return {
        id: video.id,
        title: video.snippet.title,
        thumbnail: video.snippet.thumbnails.medium.url,
        channelTitle: video.snippet.channelTitle,
        views,
        subscribers,
        multiplier,
        outlier: isOutlierVideo(views, subscribers),
      };
    }) || [];

    return NextResponse.json(results.filter((v: any) => v.outlier));
  } catch (error) {
    console.error("Unexpected error in search route:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again later." },
      { status: 500 }
    );
  }
}
