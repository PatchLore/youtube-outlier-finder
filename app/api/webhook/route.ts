import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";

// Initialize Stripe with secret key
// Using latest API version for production compatibility
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-12-15.clover",
});

// CRITICAL: Must use Node.js runtime for Stripe webhook signature verification
// Edge runtime does not support the required crypto operations
export const runtime = "nodejs";

// Force dynamic rendering (webhooks are always dynamic)
export const dynamic = "force-dynamic";

/**
 * Stripe webhook handler
 * 
 * This endpoint receives webhook events from Stripe after checkout completion.
 * When a subscription is successfully created, it updates the user's Clerk
 * publicMetadata to grant Pro access.
 * 
 * IMPORTANT: This route must receive the RAW request body (not parsed JSON).
 * Stripe's signature verification requires the exact bytes sent by Stripe.
 * Any parsing or transformation of the body will break signature verification.
 * 
 * @param req - Next.js request object containing raw webhook payload
 * @returns JSON response with status 200 on success, error response on failure
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validate webhook secret configuration
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error("[Webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  // Get the raw request body as text (required for signature verification)
  // 
  // WHY RAW BODY: Stripe's signature is computed over the exact bytes of the request body.
  // If we parse the body as JSON first, the bytes change and signature verification fails.
  // We must use req.text() to get the raw string, then verify, then parse.
  let body: string;
  try {
    body = await req.text();
    
    if (!body || body.length === 0) {
      console.error("[Webhook] Empty request body received");
      return NextResponse.json(
        { error: "Empty request body" },
        { status: 400 }
      );
    }
  } catch (bodyError: any) {
    console.error("[Webhook] Failed to read request body:", bodyError.message);
    return NextResponse.json(
      { error: "Failed to read request body" },
      { status: 400 }
    );
  }
  
  // Get the Stripe signature from headers
  // Stripe includes this header with every webhook request
  const signature = req.headers.get("stripe-signature");
  
  if (!signature) {
    console.error("[Webhook] Missing Stripe signature in headers");
    return NextResponse.json(
      { error: "Missing signature" },
      { status: 400 }
    );
  }

  // Verify the webhook signature to ensure it's from Stripe
  // 
  // This uses HMAC-SHA256 to verify that:
  // 1. The request actually came from Stripe (not a malicious third party)
  // 2. The body hasn't been modified in transit
  // 
  // If verification fails, we reject the request to prevent unauthorized access.
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[Webhook] Signature verification failed:", errorMessage);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${errorMessage}` },
      { status: 400 }
    );
  }

  // Handle only the checkout.session.completed event
  // 
  // WHY ONLY ONE EVENT: Stripe sends many event types (payment_intent.succeeded,
  // customer.subscription.created, etc.). We only care about checkout.session.completed
  // because that's when the user has successfully paid and we should grant Pro access.
  // 
  // Other events are logged but ignored to keep the webhook handler focused and simple.
  if (event.type !== "checkout.session.completed") {
    console.log(`[Webhook] Received unhandled event type: ${event.type} (id: ${event.id})`);
    // Return 200 to acknowledge receipt, even if we don't process it
    // This prevents Stripe from retrying unhandled events
    return NextResponse.json({ 
      received: true,
      event_type: event.type,
      message: "Event received but not processed"
    });
  }

  // Process checkout.session.completed event
  const session = event.data.object as Stripe.Checkout.Session;
  
  if (!session) {
    console.error("[Webhook] Missing session data in event", event.id);
    return NextResponse.json(
      { error: "Missing session data" },
      { status: 400 }
    );
  }

  // Extract clerkUserId from session metadata
  // We use metadata.clerkUserId which is set in the checkout API route
  const clerkUserId = session.metadata?.clerkUserId;
  
  if (!clerkUserId || typeof clerkUserId !== "string") {
    console.error(
      "[Webhook] No clerkUserId found in session metadata",
      { 
        session_id: session.id,
        metadata: session.metadata,
        client_reference_id: session.client_reference_id
      }
    );
    return NextResponse.json(
      { error: "Missing clerkUserId in metadata" },
      { status: 400 }
    );
  }

  // Update the Clerk user's publicMetadata to grant Pro access
  try {
    const client = await clerkClient();
    await client.users.updateUser(clerkUserId, {
      publicMetadata: {
        plan: "pro",
      },
    });
    
    console.log(`[Webhook] ✅ Successfully granted Pro access to user: ${clerkUserId} (session: ${session.id})`);
  } catch (clerkError: unknown) {
    const errorMessage = clerkError instanceof Error ? clerkError.message : "Unknown error";
    console.error("[Webhook] Failed to update Clerk user:", errorMessage, {
      clerkUserId,
      session_id: session.id
    });
    return NextResponse.json(
      { error: "Failed to update user metadata" },
      { status: 500 }
    );
  }

  // Return 200 to acknowledge receipt of the webhook
  // This tells Stripe the webhook was processed successfully
  return NextResponse.json({ 
    received: true,
    event_type: event.type,
    session_id: session.id
  });
}
