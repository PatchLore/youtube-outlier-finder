import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  console.error("🔥 SEARCH ROUTE CONFIRMED LIVE 🔥");
  return NextResponse.json(
    { marker: "SEARCH_ROUTE_CONFIRMED_LIVE" },
    { status: 418 }
  );
}
