import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_KEY = "active_niches";
const CACHE_TTL_SECONDS = 60 * 60 * 6;

async function fetchBreakoutCount(query: string): Promise<number> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const res = await fetch(
    `${appUrl}/api/search?q=${encodeURIComponent(query)}&mode=momentum&rateLimitScope=suggestions`
  );
  if (!res.ok) return 0;
  const data = await res.json();
  const results = Array.isArray(data) ? data : data?.results || [];
  return results.filter((v: any) => typeof v?.multiplier === "number" && v.multiplier >= 3).length;
}

export async function GET() {
  try {
    try {
      const cached = await kv.get(CACHE_KEY);
      if (cached) {
        return NextResponse.json(cached);
      }
    } catch {
      // Ignore cache errors
    }

    const candidateSearches = [
      "Notion templates",
      "faceless history",
      "ChatGPT workflows",
      "productivity apps",
      "study with me",
      "gaming challenge shorts",
      "AI automation",
      "Minecraft shorts",
      "finance tips",
      "morning routine",
    ];

    const validated = await Promise.all(
      candidateSearches.map(async (query) => {
        try {
          const count = await fetchBreakoutCount(query);
          return {
            query,
            count,
            hasResults: count > 0,
          };
        } catch {
          return { query, count: 0, hasResults: false };
        }
      })
    );

    const activeNiches = validated
      .filter((n) => n.hasResults)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map(({ query, count }) => ({ query, count }));

    try {
      await kv.set(CACHE_KEY, activeNiches, { ex: CACHE_TTL_SECONDS });
    } catch {
      // Ignore cache errors
    }

    return NextResponse.json(activeNiches);
  } catch {
    return NextResponse.json([]);
  }
}
