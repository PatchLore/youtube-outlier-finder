import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// User-triggered: no YouTube API. Returns static suggested terms only.
export async function GET() {
  const suggested = [
    { term: "AI Agents", score: 5 },
    { term: "Deep Research", score: 3 },
    { term: "Faceless Travel", score: 2 },
    { term: "SaaS Micro-scripts", score: 1 },
  ];
  return NextResponse.json(suggested);
}
