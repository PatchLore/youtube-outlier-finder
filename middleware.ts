import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// 1. Explicitly define all public paths
const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/api/search(.*)",
  "/api/demo-search(.*)",
  "/api/suggested-searches(.*)",
  "/sitemap.xml",
  "/robots.txt",
]);

export default clerkMiddleware(async (auth, req) => {
  console.log("Pathname:", req.nextUrl.pathname);
  const { pathname } = req.nextUrl;

  // 2. ABSOLUTE BYPASS: If the request is for our public APIs, skip Clerk entirely
  if (
    pathname.startsWith("/api/search") ||
    pathname.startsWith("/api/demo-search") ||
    pathname.startsWith("/api/suggested-searches")
  ) {
    return NextResponse.next();
  }

  // 3. Protect everything else (like /dashboard or /account)
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for static assets
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
    // Always run for API routes to ensure our bypass logic catches them
    "/api/(.*)",
  ],
};
