import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/api/search(.*)",
]);

import { NextResponse } from "next/server";

export default clerkMiddleware(async (auth, req) => {
  // CRITICAL: Skip /api/search entirely to avoid any middleware interference
  // This route needs to make outbound HTTP requests and should not be blocked
  if (req.nextUrl.pathname.startsWith("/api/search")) {
    return NextResponse.next(); // Explicit response - no Clerk processing for /api/search
  }

  // Protect routes that are not public
  // Clerk's internal routes are automatically handled and not protected
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
