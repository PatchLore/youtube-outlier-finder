import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/api/search(.*)",
  "/api/demo-search(.*)",
  "/api/suggested-searches(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Skip /api/webhook to allow Stripe webhook requests without Clerk authentication
  if (req.nextUrl.pathname.startsWith("/api/webhook")) {
    return NextResponse.next();
  }

  // Skip /api/search to allow outbound HTTP requests without Clerk processing
  if (req.nextUrl.pathname.startsWith("/api/search")) {
    return NextResponse.next();
  }
  if (req.nextUrl.pathname.startsWith("/api/demo-search")) {
    return NextResponse.next();
  }
  if (req.nextUrl.pathname.startsWith("/api/suggested-searches")) {
    return NextResponse.next();
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
