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


⚠️ Never commit real API keys.
.env.local is gitignored by default.

3. Run the dev server
npm run dev


Open:
http://localhost:3000

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
