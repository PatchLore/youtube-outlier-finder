# YouTube Outlier Finder – Production Runbook

This document is a concise checklist to walk through before and after pushing to **live production**.

---

## 1. Environment & Configuration

- **Verify env file**
  - `YOUTUBE_API_KEY` is set and valid.
  - `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set to **live** keys.
  - `NEXT_PUBLIC_STRIPE_PRICE_ID` points to the **live** Pro price.
  - `NEXT_PUBLIC_APP_URL` matches the production URL.
  - Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) are live values.

- **Sanity checks**
  - No `.env.local` or test keys are accidentally committed.
  - Vercel (or hosting provider) environment variables match `.env.production` expectations.

---

## 2. Local Health Checks (Before Deploy)

Run from project root:

```bash
npm install
npm run lint
npm run build
npm run start
```

Confirm:
- Build and lint complete without errors.
- App loads at `http://localhost:3000` and main page renders without console errors.

---

## 3. Core Functional Smoke Tests

### 3.1 Search & Filters
- Perform a **momentum** search (e.g. `faceless history facts`):
  - Results render without errors.
  - Subscriber cap and minimum views filters work as described in the UI.
  - “Breaking Now” / momentum copy matches the behavior (fresh, small‑channel, 3×+).

- Perform a **proven / Study Vault** search:
  - Only proven (3×+) breakouts are shown.
  - No sub‑3× videos appear in breakout state.

### 3.2 Zero‑Result Intelligence
- Intentionally search a quiet niche:
  - **Market Heat Check: QUIET** card appears.
  - Sample size uses `nicheAnalysis.scannedVideos` (no hard‑coded “25 videos” text).
  - QUIET header shows **strict criteria** line:
    - Recent, small channels, 3×+ breakout threshold.

- Near‑miss & Rising Signals:
  - When present, they are visually distinct from breakouts.
  - Disclaimers clarify they are **not** full breakouts.

### 3.3 Onboarding & 429 UX
- Fresh browser (clear localStorage):
  - On initial load, onboarding section appears with **historical** breakout counts.
  - Example buttons clearly say “historically X breakouts”.

- Run several valid searches:
  - Onboarding hides only after a **successful** breakout‑containing search.

- Trigger rate‑limit (11+ searches in 60 seconds):
  - 429 banner appears with:
    - “Too many searches at once. Please wait a minute or upgrade for unlimited access.”
  - Previous results remain visible.
  - Banner auto‑dismisses after ~7 seconds.
  - If this is the **first** search session, onboarding is **not** hidden permanently after a 429.

---

## 4. Stripe / Billing Checks

> Run these only against a test environment or with test cards before switching to live keys.

- **Checkout flow**
  - Click “Upgrade to Pro”.
  - Complete Stripe Checkout with test card.
  - On redirect back:
    - “Processing upgrade…” appears briefly if Clerk hasn’t updated yet.
    - Then “Pro unlocked successfully” appears once Clerk plan is `pro`.

- **Pro entitlements**
  - Pro banner / “Pro Active” state is visible.
  - Pro‑only features:
    - Rising Signals toggle.
    - Saved searches.
    - Higher subscriber caps.
  - All work without errors.

- **Webhook idempotency**
  - Confirm Stripe webhooks are configured to hit `/api/webhook`.
  - In logs, verify:
    - First `checkout.session.completed` for a session: Pro is granted once.
    - Duplicate webhooks for the same `event.id` return `duplicate: true` and do **not** double‑apply.
    - Same for `customer.subscription.deleted` events.

---

## 5. Rate Limiting & Quota Protection

- **YouTube quota**
  - Confirm typical usage pattern does not hit daily quota.
  - Rate limiting is applied per user/IP (10 requests / minute default).
  - Background “adjacent opportunities” searches use a separate rate‑limit scope and do **not** consume the main search budget.

- **API failure behavior**
  - Temporarily break the YouTube key or rate‑limit yourself:
    - UI shows “Search temporarily unavailable. Please try again later.”
    - No raw Google API error details are exposed to users.

---

## 6. Production Monitoring Checklist

After deployment:

- Check logs for:
  - Unhandled exceptions in `/api/search` and `/api/webhook`.
  - Frequent 429s (rate limit too low).
  - Webhook errors from Stripe.

- Watch key metrics (via host / Stripe / Clerk):
  - Successful checkouts vs failures.
  - Volume of search requests over time.
  - Error rate for `/api/search`.

---

## 7. Rollback / Hotfix Notes

- If a deploy introduces a **search outage**:
  - Temporarily raise rate limits or disable adjacent opportunity calls.
  - Verify YouTube API key and quota.

- If a deploy introduces a **billing issue**:
  - Disable Upgrade CTA in the UI (feature flag or simple guard).
  - Check Stripe dashboard for webhook failures and replay if necessary.

---

## 8. Final Go‑Live Checklist (Quick)

- [ ] All env vars set to **prod** values.
- [ ] `npm run build` passes locally.
- [ ] Core search + filters work in prod URL.
- [ ] Onboarding + Market Heat Check copy reads correctly and feels intentional.
- [ ] Pro checkout + webhook round‑trip works end‑to‑end.
- [ ] 429 banner shows only after expected threshold and UX feels graceful.
- [ ] Logs show no recurring 5xx errors or webhook failures.

