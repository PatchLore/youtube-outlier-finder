import { NextResponse } from "next/server";
import { getPool, query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NICHES: { name: string; priority: number }[] = [
  { name: "Finance", priority: 3 },
  { name: "AI tools", priority: 3 },
  { name: "Ecommerce", priority: 2 },
  { name: "Fitness", priority: 2 },
  { name: "Content Creation", priority: 1 },
];

const REQUIRED_PHRASES = ["how to", "beginner", "mistakes", "0 subscribers"];

/** Generate 300 keywords across niches, including required phrases. */
function generateSeedKeywords(): { keyword: string; niche: string; priority: number }[] {
  const entries: { keyword: string; niche: string; priority: number }[] = [];
  const seen = new Set<string>();

  function add(keyword: string, niche: string, priority: number) {
    const key = `${keyword.toLowerCase().trim()}|${niche}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ keyword: keyword.trim(), niche, priority });
  }

  const stems: Record<string, string[]> = {
    Finance: [
      "invest", "save money", "budget", "stocks", "crypto", "side hustle", "passive income",
      "credit score", "pay off debt", "retirement", "trading", "real estate", "taxes",
      "make money", "financial freedom", "emergency fund", "dividends", "ETF", "index funds",
      "personal finance", "wealth building", "money management", "frugal living", "income",
    ],
    "AI tools": [
      "ChatGPT", "AI automation", "AI writing", "AI video", "AI coding", "prompt engineering",
      "AI for business", "AI marketing", "AI content", "machine learning", "AI productivity",
      "AI design", "AI copywriting", "AI images", "AI tools review", "AI workflow",
      "AI agents", "AI research", "AI for creators", "AI tutorials", "AI tips",
      "AI side hustle", "AI freelancing", "AI no-code", "AI for beginners",
    ],
    Ecommerce: [
      "dropshipping", "Amazon FBA", "shopify", "product research", "ecommerce store",
      "online store", "sell online", "product photography", "ecommerce marketing",
      "niche store", "print on demand", "fulfillment", "ecommerce SEO", "product launch",
      "ecommerce ads", "conversion rate", "ecommerce for beginners", "store design",
      "inventory", "supplier", "ecommerce analytics", "ecommerce automation",
      "ecommerce 2024", "ecommerce tips", "scaling ecommerce",
    ],
    Fitness: [
      "lose weight", "build muscle", "home workout", "gym", "nutrition", "diet",
      "cardio", "strength training", "HIIT", "yoga", "running", "bodyweight",
      "fitness routine", "workout plan", "fat loss", "gain muscle", "fitness tips",
      "healthy eating", "supplements", "fitness motivation", "transformation",
      "fitness for beginners", "abs workout", "leg day", "upper body", "fitness journey",
    ],
    "Content Creation": [
      "YouTube growth", "viral content", "content strategy", "editing", "thumbnail",
      "algorithm", "monetization", "niche down", "content ideas", "filming",
      "short form", "long form", "content calendar", "creator economy", "influencer",
      "content for beginners", "editing software", "lighting", "microphone",
      "content creation tips", "grow channel", "content plan", "content marketing",
      "creator tips", "content consistency",
    ],
  };

  const perNiche = Math.ceil(300 / NICHES.length); // 60 each

  for (const { name: niche, priority } of NICHES) {
    const list = stems[niche] ?? [];
    let count = 0;

    // Required phrases: ensure we include "how to", "beginner", "mistakes", "0 subscribers" in this niche
    for (const phrase of REQUIRED_PHRASES) {
      add(`${phrase} ${niche.toLowerCase()}`, niche, priority);
      add(`${niche} ${phrase}`, niche, priority);
      if (phrase === "0 subscribers") add(`${phrase} ${niche} channel`, niche, priority);
    }

    // "how to" + stem
    for (const s of list) {
      if (count >= perNiche) break;
      add(`how to ${s}`, niche, priority);
      count++;
    }
    // "beginner" + stem / stem + "for beginners"
    for (const s of list) {
      if (count >= perNiche) break;
      add(`beginner ${s}`, niche, priority);
      add(`${s} for beginners`, niche, priority);
      count += 2;
    }
    // stem + "mistakes"
    for (const s of list) {
      if (count >= perNiche) break;
      add(`${s} mistakes`, niche, priority);
      count++;
    }
    // "0 subscribers" variants
    for (const s of list.slice(0, 10)) {
      if (count >= perNiche) break;
      add(`0 subscribers ${s}`, niche, priority);
      count++;
    }
    // Fill rest with stem, "stem tips", "best stem", etc.
    for (const s of list) {
      if (count >= perNiche) break;
      add(s, niche, priority);
      add(`${s} tips`, niche, priority);
      add(`best ${s}`, niche, priority);
      count += 3;
    }
  }

  // Trim to exactly 300 and return
  return entries.slice(0, 300);
}

export async function POST(req: Request) {
  try {
    const pool = getPool();
    if (!pool) {
      return NextResponse.json(
        { error: "DATABASE_URL not set" },
        { status: 503 }
      );
    }

    const auth = req.headers.get("authorization");
    const secret = process.env.ADMIN_SECRET ?? process.env.CRON_SECRET;
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keywords = generateSeedKeywords();
    const keywordList = keywords.map((r) => r.keyword);
    const nicheList = keywords.map((r) => r.niche);
    const priorityList = keywords.map((r) => r.priority);

    const result = await query(
      `INSERT INTO keywords (keyword, niche, priority)
       SELECT k, n, p FROM UNNEST($1::text[], $2::text[], $3::smallint[]) AS t(k, n, p)
       ON CONFLICT (keyword, niche) DO NOTHING`,
      [keywordList, nicheList, priorityList]
    );

    return NextResponse.json({
      ok: true,
      total: keywords.length,
      inserted: result.rowCount,
      skipped: keywords.length - result.rowCount,
    });
  } catch (err) {
    console.error("[Seed Keywords Error]:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Seed failed", message: msg },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
