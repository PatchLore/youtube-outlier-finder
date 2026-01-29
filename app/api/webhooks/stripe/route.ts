import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { kv } from "@vercel/kv";
import { clerkClient } from "@clerk/nextjs/server";
import { getPool, query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROCESSED_EVENT_TTL_SECONDS = 60 * 60 * 24 * 7;

async function isDuplicateEvent(eventId: string): Promise<boolean> {
  try {
    const existing = await kv.get(`stripe:event:${eventId}`);
    return !!existing;
  } catch {
    return false;
  }
}

async function recordEventProcessed(eventId: string): Promise<void> {
  try {
    await kv.set(`stripe:event:${eventId}`, "1", { ex: PROCESSED_EVENT_TTL_SECONDS });
  } catch {
    // no-op
  }
}

async function findClerkUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
  const client = await clerkClient();
  let clerkUserId: string | null = null;
  let pageOffset = 0;
  const pageSize = 100;

  while (clerkUserId === null) {
    const userList = await client.users.getUserList({
      limit: pageSize,
      offset: pageOffset,
    });
    for (const user of userList.data) {
      if (user.publicMetadata?.stripeCustomerId === stripeCustomerId) {
        clerkUserId = user.id;
        break;
      }
    }
    if (userList.data.length < pageSize || clerkUserId !== null) break;
    pageOffset += pageSize;
  }
  return clerkUserId;
}

/** Upsert users.plan = 'pro' for clerk_user_id + stripe_customer_id. */
async function setUserPlanPro(clerkUserId: string, stripeCustomerId: string): Promise<void> {
  await query(
    `INSERT INTO users (clerk_user_id, stripe_customer_id, plan, updated_at)
     VALUES ($1, $2, 'pro', NOW())
     ON CONFLICT (clerk_user_id) DO UPDATE SET
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       plan = 'pro',
       updated_at = NOW()`,
    [clerkUserId, stripeCustomerId]
  );
}

/** Set users.plan = 'free' by stripe_customer_id (or clerk_user_id). */
async function setUserPlanFreeByStripeCustomerId(stripeCustomerId: string): Promise<void> {
  await query(
    `UPDATE users SET plan = 'free', updated_at = NOW() WHERE stripe_customer_id = $1`,
    [stripeCustomerId]
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error("[Webhooks/Stripe] STRIPE_SECRET_KEY not configured");
    return NextResponse.json({ error: "Stripe secret key not configured" }, { status: 500 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Webhooks/Stripe] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-12-15.clover" });

  let body: string;
  try {
    body = await req.text();
    if (!body?.length) {
      return NextResponse.json({ error: "Empty body" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Webhooks/Stripe] Signature verification failed:", msg);
    return NextResponse.json({ error: `Signature verification failed: ${msg}` }, { status: 400 });
  }

  if (await isDuplicateEvent(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (!getPool()) {
    console.error("[Webhooks/Stripe] DATABASE_URL not set");
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid" || session.status !== "complete") {
      await recordEventProcessed(event.id);
      return NextResponse.json({ received: true, skipped: true });
    }
    const clerkUserId =
      typeof session.client_reference_id === "string" ? session.client_reference_id : null;
    const stripeCustomerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (clerkUserId && stripeCustomerId) {
      await setUserPlanPro(clerkUserId, stripeCustomerId);
      console.log("[Webhooks/Stripe] ✅ checkout.session.completed: plan=pro", { clerkUserId, stripeCustomerId });
    }
    await recordEventProcessed(event.id);
    return NextResponse.json({ received: true, event_type: event.type });
  }

  if (event.type === "customer.subscription.created") {
    const subscription = event.data.object as Stripe.Subscription;
    const stripeCustomerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    if (!stripeCustomerId) {
      return NextResponse.json({ error: "Missing customer ID" }, { status: 400 });
    }
    const clerkUserId = await findClerkUserIdByStripeCustomerId(stripeCustomerId);
    if (clerkUserId) {
      await setUserPlanPro(clerkUserId, stripeCustomerId);
      console.log("[Webhooks/Stripe] ✅ subscription.created: plan=pro", { clerkUserId, stripeCustomerId });
    } else {
      console.warn("[Webhooks/Stripe] subscription.created: no Clerk user for customer", { stripeCustomerId });
    }
    await recordEventProcessed(event.id);
    return NextResponse.json({ received: true, event_type: event.type });
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const stripeCustomerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    if (!stripeCustomerId) {
      return NextResponse.json({ error: "Missing customer ID" }, { status: 400 });
    }
    await setUserPlanFreeByStripeCustomerId(stripeCustomerId);
    console.log("[Webhooks/Stripe] ✅ subscription.deleted: plan=free", { stripeCustomerId });
    await recordEventProcessed(event.id);
    return NextResponse.json({ received: true, event_type: event.type });
  }

  await recordEventProcessed(event.id);
  return NextResponse.json({ received: true, event_type: event.type, handled: false });
}
