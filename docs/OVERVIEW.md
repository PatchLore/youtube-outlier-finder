# YouTube Outlier Finder — Overview

## What This Web App Is

**YouTube Outlier Finder** helps creators find YouTube videos that **massively outperform their channel size** (high views relative to subscribers) so they can spot breakout ideas before they go mainstream.

- **Core idea:** Virality multiplier = views ÷ subscribers. Videos with 3×+ multiplier are “outliers” — they punched above their audience weight.
- **Users:** Free tier (5 results per search, 14-day age filter) and **Pro** (up to 100 results, outlier_score sort, saved searches, Stripe billing).
- **Stack:** Next.js (App Router), TypeScript, Tailwind, Clerk (auth), Stripe (subscriptions), Neon (Postgres), YouTube Data API v3, Vercel KV (cache/rate limit).

---

## What Has Been Done

### Product & UI

- **Search:** User types a query → `/api/search` → DB-only search (no live YouTube API on request). Results come from pre-ingested `videos` + `channels` + `keywords`.
- **Outlier logic:** 3× multiplier threshold, tier classification (breakout, emerging, high_signal, niche_outlier), velocity (views/day), like ratio. Pro sort uses `outlier_score` (base × log10 confidence × freshness × channel penalty).
- **Modes:** “Breaking Now” (momentum, 60/90-day filters) and “Study Vault” (proven, all-time).
- **Zero-result handling:** Near-miss detection (2.5–2.99×), soft landing UI, save-search CTA, refinement hints.
- **UI:** Dark theme, purple/pink accents, responsive layout, tier badges, Market Heat Check / niche analysis when no breakouts found.
- **Auth & billing:** Clerk sign-in; Stripe Checkout; webhook at `/api/webhooks/stripe` updates `users.plan`; middleware bypasses Clerk for webhooks, cron, and `/api/admin/seed-keywords`.

### Database & Backend

- **Neon Postgres:** Lazy singleton in `lib/db.ts`; migrations 001–011 (channels, keywords, videos, video_keywords, ingestion_jobs, users, niche/priority/last_ingested_at, outlier_score, etc.).
- **Keywords:** 300 keywords seeded via `/api/admin/seed-keywords` (batch insert, 100 per batch, Bearer CRON_SECRET). Niches: Finance, AI tools, Ecommerce, Fitness, Content Creation. UNIQUE on `keyword`.
- **Ingest pipeline:** `/api/cron/ingest` — picks keywords by `last_ingested_at` (24h cooldown), calls YouTube Data API (search + video + channel details), computes `outlier_score`, upserts `videos`/`channels`/`video_keywords`. CRON_SECRET required; Vercel KV used for daily quota cap (9,500 units).
- **Scheduling:** Vercel cron in `vercel.json` is once daily (`0 0 * * *`) due to Hobby limit. **GitHub Actions** (`.github/workflows/ingest-cron.yml`) POSTs to `/api/cron/ingest` every 15 minutes with `Authorization: Bearer ${{ secrets.CRON_SECRET }}`.
- **Search API:** Plan from `users` table (Clerk user id); cache key includes plan and mode; free = 5 results + 14-day filter, pro = 100 + outlier_score sort.

### Docs & Config

- **Docs:** README, PROJECT_STATUS.md, MONETIZATION_ROADMAP.md, PAID_TIER_FEATURES.md, MOMENTUM_VS_PROVEN_FORMATS.md, ZERO_RESULT_INTELLIGENCE.md, SUBSCRIBER_SCALE_STRATEGY.md, PRODUCTION_RUNBOOK.md, docs/PROJECT_STATUS_DATA_ENGINE.md.
- **Env:** `.env` / `.env.local` / `.env.production.local` (no quotes, CRON_SECRET in all). GitHub Actions and Vercel need CRON_SECRET; Stripe webhook secret and DATABASE_URL on Vercel.

---

## What Needs Doing

### Data engine (4-phase plan)

1. **Phase 1 — Verify harvest:** Confirm `/api/cron/ingest` (not “fetch-videos”) is being triggered by GitHub Actions and that logs show processing of niches/keywords and writes to `videos`. Fix route name in docs if needed (`/api/cron/ingest`).
2. **Phase 2 — Inspect data:** In Neon SQL Editor, run something like:  
   `SELECT title, views, outlier_score FROM videos ORDER BY outlier_score DESC NULLS LAST LIMIT 10;`  
   (Note: column is `views`, not `view_count`; `niche` lives on `keywords` via `video_keywords`, not on `videos`.) Use this to validate outlier_score and data quality.
3. **Phase 3 — Display & niche filtering:** Add a way for the UI to pull from the `videos` table by niche (e.g. GET `/api/videos?niche=Finance&sort=outlier_score&limit=20`) and a “Browse by niche” or filter (Finance, AI tools, Ecommerce, Fitness, Content Creation) so the dashboard shows live DB data and sorts by Outlier Score.
4. **Phase 4 — Quota & scale:** Monitor YouTube Data API v3 quota (10k/day default). If needed, reduce cron frequency or keywords per cycle; KV quota cap is already in place (9,500).

### Frontend & product

- **Tier metadata in UI:** Backend already returns `outlierTier`, `viewsPerDay`, `likeRatio`, `nicheAverageMultiplier`. Ensure `OutlierResult` and cards in `HomeClient.tsx` show tier badges and, where useful, these metrics.
- **Saved searches (DB):** Currently localStorage. Persist to DB for cross-device and future email digests (Phase 2 in PROJECT_STATUS.md).
- **Email digests / alerts:** Planned (Resend or similar), blocked on DB-backed saved searches.

### Operational

- **Stripe webhook:** Point Stripe Dashboard to `https://<your-vercel-domain>/api/webhooks/stripe`; set `STRIPE_WEBHOOK_SECRET` on Vercel.
- **Migrations:** Ensure all migrations 001–011 have been run on the Neon DB used in production.
- **CRON_SECRET:** Same value in Vercel (env) and GitHub repo secrets so Actions can call `/api/cron/ingest` and the app can validate it.

---

## Quick reference

| Area           | Done | Pending |
|----------------|------|--------|
| Search (DB)    | ✅   | —       |
| Free/Pro gating| ✅   | —       |
| Stripe + Clerk | ✅   | Webhook URL + env in prod |
| Keywords seed  | ✅   | —       |
| Cron ingest    | ✅ (GitHub Actions) | Verify logs & data |
| Niche browse / filter UI | — | Phase 3 |
| Tier badges & metrics in UI | Partial | Full integration |
| Saved searches in DB | — | Phase 2 |
| Email digests  | — | After DB saved searches |
