YouTube Outlier Finder

Find YouTube videos that massively outperform their audience size — so you can spot ideas that are breaking out before they go mainstream.

Most tools show what’s popular.
Outlier Finder shows what worked — even without a big audience.

What this app does

Searches YouTube by niche or format (e.g. gaming horror, faceless youtube)

Identifies outlier videos using a virality multiplier (views ÷ subscribers)

Filters out noise from large channels

Surfaces recent breakout signals, not stale “top of all time” results

Built for creators who want to be early, not lucky.

Tech stack

Next.js (App Router)

TypeScript

Tailwind CSS

Clerk (authentication)

YouTube Data API v3

Getting started (local development)
1. Install dependencies
npm install

2. Environment variables

Create a .env.local file in the project root:

# Clerk authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# YouTube Data API
YOUTUBE_API_KEY=your_youtube_api_key

# Stripe (for Pro subscriptions)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PRICE_ID=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
STRIPE_WEBHOOK_SECRET=whsec_...  # See "Stripe Webhook (Local Dev)" section below


⚠️ Never commit real API keys.
.env.local is gitignored by default.

3. Run the dev server
npm run dev


Open:
http://localhost:3000

## Stripe Webhook (Local Dev)

To test Pro subscription checkout locally, you need to forward Stripe webhooks to your local server.

### Prerequisites

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login to Stripe CLI: `stripe login`

### Setup Steps

1. **Start your Next.js dev server** (in one terminal):
   ```powershell
   npm run dev
   ```

2. **Forward Stripe webhooks** (in another terminal):
   ```powershell
   stripe listen --forward-to localhost:3000/api/webhook
   ```

3. **Copy the webhook signing secret**:
   - The Stripe CLI will output: `Ready! Your webhook signing secret is whsec_...`
   - Copy this secret value

4. **Add to .env.local**:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

5. **Restart your dev server** to load the new environment variable

### Important Notes

- **Webhook secret ≠ API keys**: The webhook secret (`whsec_...`) is different from your Stripe API keys (`sk_test_...` or `pk_test_...`)
- **Local only**: The webhook secret from Stripe CLI is only for local development
- **Production**: In production, get the webhook secret from Stripe Dashboard > Webhooks > Your endpoint
- **Auto-unlock**: After successful payment, the webhook automatically grants Pro access (no page refresh needed, but refresh to see changes)

### Testing

1. Click "Unlock full results" button
2. Complete checkout with test card: `4242 4242 4242 4242`
3. Check Stripe CLI terminal for webhook delivery confirmation
4. Check Next.js server logs for: `✅ Successfully granted Pro access to user: ...`
5. Refresh the page → User should now have Pro access

Project structure (high level)
app/
  api/            # API routes (YouTube search, outlier logic)
  components/     # UI components
  pricing/        # Pricing page
lib/
  outlier.ts      # Core virality & outlier calculations
middleware.ts     # Clerk middleware

Free vs Pro (current direction)

Free

Unlimited searches

Top 5 outliers per search

Confidence tiers & plain-English explanations

Pro

All outlier results

Subscriber cap & view floor filters

Sorting by multiplier or views

Weekly personalized outlier digest

Alerts for new breakouts in saved niches

(Stripe billing coming next.)

Related docs

MONETIZATION_ROADMAP.md

PAID_TIER_FEATURES.md

SUBSCRIBER_SCALE_STRATEGY.md

These contain deeper product and pricing thinking.

Status

Actively in development.
Auth is being finalised, followed by billing and Pro gating.

License

Private / proprietary (for now).
