import { NextResponse } from "next/server";

/**
 * GET /api/health – liveness check for the app.
 * Returns 200 when the app is running.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, status: "ok" });
}
