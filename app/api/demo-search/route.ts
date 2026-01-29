import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_KEY = "demo_search_best";
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

    const activeNiches = [
      { query: "Notion templates", count: 0 },
      { query: "faceless history shorts", count: 0 },
      { query: "ChatGPT workflows", count: 0 },
      { query: "productivity app reviews", count: 0 },
    ];

    const validated = await Promise.all(
      activeNiches.map(async (niche) => {
        const count = await fetchBreakoutCount(niche.query);
        return { ...niche, count };
      })
    );

    const best = validated.sort((a, b) => b.count - a.count)[0] || activeNiches[0];

    try {
      await kv.set(CACHE_KEY, best, { ex: CACHE_TTL_SECONDS });
    } catch {
      // Ignore cache errors
    }

    return NextResponse.json(best);
  } catch {
    return NextResponse.json({ query: "Notion templates", count: 0 });
  }
}
