import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";

// CRITICAL: Must use Node.js runtime for Stripe webhook signature verification
// Edge runtime does not support the required crypto operations
export const runtime = "nodejs";

// Force dynamic rendering (webhooks are always dynamic)
export const dynamic = "force-dynamic";

// Stripe can retry webhook deliveries; we must ensure each event is applied once.
// TODO: Persist this in a durable store (DB/KV) to survive server restarts.
const processedStripeEventIds = new Set<string>();

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
  // Get and validate Stripe secret key
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  
  if (!stripeSecretKey) {
    console.error("[Webhook] STRIPE_SECRET_KEY is not configured");
    return NextResponse.json(
      { error: "Stripe secret key not configured" },
      { status: 500 }
    );
  }
  
  // Validate key format (must start with sk_test_, sk_live_, rk_test_, or rk_live_)
  if (
    !stripeSecretKey.startsWith("sk_test_") &&
    !stripeSecretKey.startsWith("sk_live_") &&
    !stripeSecretKey.startsWith("rk_test_") &&
    !stripeSecretKey.startsWith("rk_live_")
  ) {
    console.error("[Webhook] Invalid STRIPE_SECRET_KEY format. Key must start with 'sk_test_', 'sk_live_', 'rk_test_', or 'rk_live_'");
    return NextResponse.json(
      { error: "Invalid Stripe secret key format" },
      { status: 500 }
    );
  }
  
  // Initialize Stripe client inside handler to prevent build-time execution
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-12-15.clover",
  });

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

  // Idempotency: Stripe retries can deliver the same event multiple times.
  if (processedStripeEventIds.has(event.id)) {
    console.log(`[Webhook] Duplicate event received: ${event.type} (id: ${event.id})`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Handle checkout.session.completed and customer.subscription.deleted events
  if (event.type === "checkout.session.completed") {
    // Handle checkout completion (existing logic)
    const response = await handleCheckoutCompleted(event, stripe);
    if (response.status === 200) {
      processedStripeEventIds.add(event.id);
    }
    return response;
  } else if (event.type === "customer.subscription.deleted") {
    // Handle subscription cancellation
    const response = await handleSubscriptionDeleted(event);
    if (response.status === 200) {
      processedStripeEventIds.add(event.id);
    }
    return response;
  } else {
    // Other events are logged but ignored
    console.log(`[Webhook] Received unhandled event type: ${event.type} (id: ${event.id})`);
    // Return 200 to acknowledge receipt, even if we don't process it
    // This prevents Stripe from retrying unhandled events
    processedStripeEventIds.add(event.id);
    return NextResponse.json({ 
      received: true,
      event_type: event.type,
      message: "Event received but not processed"
    });
  }
}

async function handleCheckoutCompleted(event: Stripe.Event, stripe: Stripe) {

  const session = event.data.object as Stripe.Checkout.Session;
  
  if (!session) {
    console.error("[Webhook] Missing session data in event", event.id);
    return NextResponse.json(
      { error: "Missing session data" },
      { status: 400 }
    );
  }

  // Extract clerkUserId from client_reference_id
  // This is set in the checkout API route and is the recommended way to pass user identifiers
  const clerkUserId = session.client_reference_id;
  
  if (!clerkUserId || typeof clerkUserId !== "string") {
    console.error(
      "[Webhook] No client_reference_id found in session",
      { 
        session_id: session.id,
        client_reference_id: session.client_reference_id
      }
    );
    return NextResponse.json(
      { error: "Missing client_reference_id in session" },
      { status: 400 }
    );
  }

  // Get Stripe customer ID from the session
  // session.customer can be a string (customer ID) or a Customer object
  const stripeCustomerId = typeof session.customer === "string" 
    ? session.customer 
    : session.customer?.id;
  
  if (!stripeCustomerId || typeof stripeCustomerId !== "string") {
    console.error(
      "[Webhook] No customer ID found in session",
      { 
        session_id: session.id,
        customer: session.customer
      }
    );
    return NextResponse.json(
      { error: "Missing customer ID in session" },
      { status: 400 }
    );
  }

  // Update the Clerk user's publicMetadata to grant Pro access
  // This operation is idempotent - safe to call multiple times
  try {
    const client = await clerkClient();
    
    // Get current user to check existing metadata
    const currentUser = await client.users.getUser(clerkUserId);
    const currentPlan = currentUser.publicMetadata?.plan;
    const currentStripeCustomerId = currentUser.publicMetadata?.stripeCustomerId;
    
    // Prepare updated metadata
    const updatedMetadata: Record<string, unknown> = {
      ...currentUser.publicMetadata,
      plan: "pro",
      stripeCustomerId: stripeCustomerId,
    };
    
    // Only update if metadata has changed (idempotent check)
    const needsUpdate = currentPlan !== "pro" || currentStripeCustomerId !== stripeCustomerId;
    
    if (needsUpdate) {
      await client.users.updateUser(clerkUserId, {
        publicMetadata: updatedMetadata,
      });
      
      if (currentPlan !== "pro") {
        console.log(`[Webhook] ✅ Successfully granted Pro access to user: ${clerkUserId} (session: ${session.id}, customer: ${stripeCustomerId})`);
      } else {
        console.log(`[Webhook] ✅ Updated stripeCustomerId for Pro user: ${clerkUserId} (customer: ${stripeCustomerId})`);
      }
    } else {
      console.log(`[Webhook] ✅ User already has Pro access with matching customer ID: ${clerkUserId} (session: ${session.id})`);
    }
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
  return NextResponse.json({ 
    received: true,
    event_type: event.type,
    session_id: session.id
  });
}

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  
  if (!subscription) {
    console.error("[Webhook] Missing subscription data in event", event.id);
    return NextResponse.json(
      { error: "Missing subscription data" },
      { status: 400 }
    );
  }

  // Get Stripe customer ID from the subscription
  const stripeCustomerId = typeof subscription.customer === "string" 
    ? subscription.customer 
    : subscription.customer?.id;
  
  if (!stripeCustomerId || typeof stripeCustomerId !== "string") {
    console.error(
      "[Webhook] No customer ID found in subscription",
      { 
        subscription_id: subscription.id,
        customer: subscription.customer
      }
    );
    return NextResponse.json(
      { error: "Missing customer ID in subscription" },
      { status: 400 }
    );
  }

  // Find the Clerk user with matching stripeCustomerId in publicMetadata
  try {
    const client = await clerkClient();
    
    // List users and find the one with matching stripeCustomerId
    // Note: This requires iterating through users, which may be inefficient for large user bases
    // In production, consider storing a reverse mapping or using Clerk's user search if available
    let clerkUserId: string | null = null;
    let pageOffset = 0;
    const pageSize = 100;
    
    while (clerkUserId === null) {
      const userList = await client.users.getUserList({ 
        limit: pageSize,
        offset: pageOffset 
      });
      
      // Check each user for matching stripeCustomerId
      for (const user of userList.data) {
        if (user.publicMetadata?.stripeCustomerId === stripeCustomerId) {
          clerkUserId = user.id;
          break;
        }
      }
      
      // If we've checked all users or found a match, break
      if (userList.data.length < pageSize || clerkUserId !== null) {
        break;
      }
      
      pageOffset += pageSize;
    }
    
    if (!clerkUserId) {
      console.error(
        "[Webhook] No Clerk user found with stripeCustomerId",
        { 
          stripeCustomerId,
          subscription_id: subscription.id
        }
      );
      // Return 200 to acknowledge receipt even if user not found
      // This prevents Stripe from retrying
      return NextResponse.json({ 
        received: true,
        event_type: event.type,
        message: "User not found, but event acknowledged"
      });
    }

    // Get current user to check existing metadata (idempotent check)
    const currentUser = await client.users.getUser(clerkUserId);
    const currentPlan = currentUser.publicMetadata?.plan;
    
    // Only update if user currently has Pro access (idempotent check)
    if (currentPlan === "pro") {
      // Remove plan from metadata (downgrade to free)
      // Keep stripeCustomerId for reference
      const updatedMetadata: Record<string, unknown> = {
        ...currentUser.publicMetadata,
      };
      delete updatedMetadata.plan;
      
      await client.users.updateUser(clerkUserId, {
        publicMetadata: updatedMetadata,
      });
      
      console.log(`[Webhook] ✅ Successfully downgraded user: ${clerkUserId} (subscription: ${subscription.id}, customer: ${stripeCustomerId})`);
    } else {
      console.log(`[Webhook] ✅ User already downgraded: ${clerkUserId} (subscription: ${subscription.id})`);
    }
  } catch (clerkError: unknown) {
    const errorMessage = clerkError instanceof Error ? clerkError.message : "Unknown error";
    console.error("[Webhook] Failed to downgrade Clerk user:", errorMessage, {
      stripeCustomerId,
      subscription_id: subscription.id
    });
    return NextResponse.json(
      { error: "Failed to update user metadata" },
      { status: 500 }
    );
  }

  // Return 200 to acknowledge receipt of the webhook
  return NextResponse.json({ 
    received: true,
    event_type: event.type,
    subscription_id: subscription.id
  });
}
