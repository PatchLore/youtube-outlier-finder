# Implementation Plan: OutlierYT Alerts & Supabase Auth

## 1. Database Schema (Supabase/PostgreSQL)

Run this SQL in the Supabase SQL Editor to create the necessary tables:

```sql
-- Table to store user-specific alerts
create table alerts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  query text not null,
  last_notified_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  is_active boolean default true,
  -- Ensure a user doesn't monitor the same niche twice
  unique(user_id, query)
);

-- Enable Row Level Security
alter table alerts enable row level security;

-- Users can only see/delete their own alerts
create policy "Users can manage their own alerts"
  on alerts for all
  using (auth.uid() = user_id);
```

---

## 2. Feature: "Monitor this Niche" Auth Gate

Objective: Allow anonymous browsing, but require a free account to set alerts.

### Step A: Auth Memory Logic

In `app/components/MarketIntelligenceReport.tsx`:

- When **"Monitor"** is clicked, check `supabase.auth.getUser()`.
- If **Logged In**: Trigger `POST /api/alerts`.
- If **Guest**: Save the current `{ searchQuery }` to `sessionStorage` and trigger the `AuthAlertModal`.

### Step B: The AuthAlertModal

Create `components/modals/AuthAlertModal.tsx`:

- **UI:** Clean Tailwind modal with "Continue with Google" and "Email/Password" options.
- **Pitch:** "Track [Niche] 24/7. We scan YouTube hourly. Get an email the second a small channel hits a 3x breakout."
- **Footer:** "Free: 1 niche limit. Pro: Unlimited tracking."

---

## 3. Feature: The Alert Creation API

Create `app/api/alerts/route.ts`:

- **Check Tier:** Verify if the user is 'Pro'.
- **Limit Check:** If 'Free', check the alerts table. If count >= 1, return 403 Forbidden with a message to upgrade.
- **Insert:** Save the new query to the alerts table.

---

## 4. Feature: The Cron Job (The "Watcher")

Create `app/api/cron/check-alerts/route.ts`:

**Frequency:** Set to run every 1–6 hours via Vercel Cron.

### Workflow

- Fetch all active alerts from Supabase.
- For each query, execute the internal search logic (re-using the multiplier >= 3.0 and 60-day filters).
- Compare results against the `last_notified_at` timestamp.
- If a new breakout is found:
  - Use Resend to email the user.
  - Update `last_notified_at` to the current time.

---

## 5. Resend Email Template (React Component)

Add this to the document so Cursor can build the emails/BreakoutAlert.tsx file:

```ts
// Suggested styling: Use a dark theme to match your app's brand
import { Html, Head, Body, Container, Section, Text, Link, Heading, Hr } from "@react-email/components";

export const BreakoutAlertEmail = ({ query, videoTitle, channelName, multiplier, videoUrl }) => (
  <Html>
    <Head />
    <Body style={{ backgroundColor: "#0f172a", color: "#f8fafc", fontFamily: "sans-serif" }}>
      <Container style={{ padding: "40px 20px" }}>
        <Heading style={{ color: "#c084fc", fontSize: "24px" }}>🚀 New Breakout Spotted!</Heading>
        <Text>We found a new outlier for your monitored niche: <strong>"{query}"</strong></Text>
        
        <Section style={{ backgroundColor: "#1e293b", padding: "20px", borderRadius: "12px", border: "1px solid #334155" }}>
          <Text style={{ fontSize: "18px", fontWeight: "bold", margin: "0" }}>{videoTitle}</Text>
          <Text style={{ color: "#94a3b8", fontSize: "14px" }}>Channel: {channelName}</Text>
          <Text style={{ color: "#4ade80", fontWeight: "bold" }}>Momentum: {multiplier}x more views than usual!</Text>
          <Link href={videoUrl} style={{ backgroundColor: "#7c3aed", color: "#fff", padding: "12px 24px", borderRadius: "8px", display: "inline-block", textDecoration: "none", marginTop: "15px" }}>
            View Video Idea →
          </Link>
        </Section>

        <Hr style={{ margin: "30px 0", borderColor: "#334155" }} />
        <Text style={{ fontSize: "12px", color: "#64748b" }}>
          You are receiving this because you monitor "{query}" on OutlierYT. 
          To manage your alerts or upgrade to Pro for instant notifications, visit your dashboard.
        </Text>
      </Container>
    </Body>
  </Html>
);
```

---

## 6. The "Self-Cleaning" Logic (Important)

In the Cron Job logic, before sending an email, verify the `video_id` against a small cache or a `notified_ids` column in the database. Only send the email if the video is truly new to the user since the last scan.

---

## Instructions for Cursor (Tomorrow)

- Use the **Supabase SSR library** for all Auth and Database calls.
- Use **sessionStorage** to ensure the "Success Action" happens automatically after the user completes the Supabase Auth redirect.
- Ensure the `MarketIntelligenceReport` component correctly reflects the "Monitoring" status if the user already has an alert for that specific query.

---

## One Final Tip for Tomorrow

When you create the Supabase project, make sure to grab your **URL** and **Anon Key** and add them to your `.env.local` file immediately. Cursor will need those to write the connection logic!

---

## Final "Tomorrow" To‑Do List

- Create Supabase Project and store keys.
- Enable **Google Provider** in Supabase Authentication (if you want one‑tap login).
- Create a Resend API key and add `RESEND_API_KEY` to Vercel env vars.

You’re all set! You have built a massive amount of infrastructure today. You went from a simple search bar to a multi‑tiered intelligence engine with:

- ✅ Dynamic Success Path (Onboarding)
- ✅ Market Intelligence Reports (Reframed Quiet State)
- ✅ Related Niche Suggestions (Anti‑Dead End)
- ✅ Tiered Signal Results (Rising Signals)
- ✅ Vercel KV Caching (Speed & Reliability)

Tomorrow, adding Supabase and Resend will turn this into a fully automated SaaS.
