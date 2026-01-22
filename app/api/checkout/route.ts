import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

// CRITICAL: Must use Node.js runtime for Stripe API calls
export const runtime = "nodejs";

// Force dynamic rendering (checkout is always dynamic)
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // Get and validate Stripe secret key
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    // TEMPORARY DEBUG: Log key prefix to identify source
    console.log(
      "[Stripe Debug] STRIPE_SECRET_KEY prefix:",
      stripeSecretKey?.slice(0, 7) || "undefined"
    );
    
    if (!stripeSecretKey) {
      console.error("[Stripe] STRIPE_SECRET_KEY is not configured");
      return NextResponse.json(
        { error: "Stripe secret key not configured" },
        { status: 500 }
      );
    }
    
    // Validate key format (must start with sk_test_ or sk_live_)
    if (!stripeSecretKey.startsWith("sk_test_") && !stripeSecretKey.startsWith("sk_live_")) {
      console.error("[Stripe] Invalid STRIPE_SECRET_KEY format. Key must start with 'sk_test_' or 'sk_live_'");
      return NextResponse.json(
        { error: "Invalid Stripe secret key format" },
        { status: 500 }
      );
    }
    
    // Initialize Stripe client inside handler to prevent build-time execution
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-12-15.clover",
    });

    // Require authenticated user
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get environment variables
    const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price ID not configured" },
        { status: 500 }
      );
    }

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}`,
      // Store Clerk user ID in metadata so webhook can identify the user
      // The webhook will use this to update the user's publicMetadata with plan: "pro"
      metadata: {
        clerkUserId: userId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
