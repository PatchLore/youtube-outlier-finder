# API Error Investigation: "An unexpected error occurred"

## Root cause (search API)

The message **"An unexpected error occurred. Please try again later."** is returned by the **search API** when any exception is caught by the **outer** `try/catch` (lines 163–169). The most likely causes in production are:

1. **`searchFromDb()` throws** – The only unguarded async call in the happy path. It uses `query()` from `lib/db`, which can throw when:
   - **DATABASE_URL** is missing (we already return 503 before calling `searchFromDb` when `getPool()` is null).
   - **Connection failures**: wrong URL, Neon unreachable, SSL issues, timeout (ECONNREFUSED, ETIMEDOUT, ENOTFOUND).
   - **Schema / migrations**: tables `videos`, `channels`, `video_keywords`, `keywords` don’t exist (e.g. "relation \"videos\" does not exist").
   - **Transient DB errors**: connection closed, 57P01/57P03.

2. **KV cache** – `kv.get()` / `kv.set()` are already inside their own try/catch; failures are ignored, so they don’t trigger the generic 500.

3. **Rate limit (Redis)** – Rate limiting is in a try/catch; failures are ignored.

---

## Annotated failure points

### Search API (`app/api/search/route.ts`)

| Location | Code | Risk | Notes |
|----------|------|------|--------|
| **52–53** | `new URL(req.url)` | Low | Next.js provides valid `req.url`. |
| **74–75** | `await kv.get(cacheKey)` | Handled | In try/catch; cache miss/error is ignored. |
| **139–145** | `getPool()` null | Handled | Returns 503 "Search temporarily unavailable." |
| **147** | `await searchFromDb(trimmedQuery, mode)` | **High** | Was unguarded. Any DB or `searchFromDb` error (connection, missing table, etc.) threw and was caught by outer catch → 500 "An unexpected error." |
| **155–159** | `await kv.set(...)` | Handled | In try/catch; write failure ignored. |
| **163–169** | Outer `catch (err)` | Previously hid cause | Only logged `err` and returned generic 500. Now: log structured (message, code, stack), classify DB vs other, return 503 or 500. |

### Cron API (`app/api/cron/ingest/route.ts`)

| Location | Code | Risk | Notes |
|----------|------|------|--------|
| **18–24** | `getTodayQuotaUsed()` → `query(...)` | **High** | If `ingestion_jobs` table missing or DB down, throws → outer catch → 500. |
| **128–132** | `getPool()` null | Handled | Returns 503. |
| **141–146** | `query(INSERT ingestion_jobs...)` | **High** | Table missing or constraint → throw. |
| **151–155** | `query(SELECT keywords...)` | **High** | Table missing → throw. |
| **240–256** | `query(UPDATE ingestion_jobs...)` | Medium | In success path; throw would hit outer catch. |
| **267–285** | Outer `catch (err)` | Previously 500 only | Now: log structured, classify DB unavailable → 503, else 500. |

### lib/db-search.ts

| Location | Code | Risk | Notes |
|----------|------|------|--------|
| **126–147** | `await query<DbVideoRow>(SELECT ...)` | **High** | Single DB call in `searchFromDb`. Connection or missing table throws; caller (search route) must catch. |

### lib/db.ts

| Location | Code | Risk | Notes |
|----------|------|------|--------|
| **36** | `p.query(text, params)` | **High** | Throws on connection error, timeout, or SQL error. Callers must catch. |

---

## Environment variables

| Variable | Search API | Cron API | Notes |
|----------|------------|----------|--------|
| **DATABASE_URL** | Required (pool null → 503) | Required (pool null → 503) | Only source for DB connection. |
| **KV_REST_API_*** / Vercel KV | Optional (cache only) | – | Search uses `@vercel/kv`; failure is ignored. |
| **UPSTASH_REDIS_*** | Optional (rate limit) | – | Search rate limit; failure is ignored. |
| **YOUTUBE_API_KEY** | – | Required | Cron returns 500 if missing. |
| **CRON_SECRET** | – | Optional | If set, request must send `Authorization: Bearer <CRON_SECRET>`. |

---

## Fixes applied

1. **Search API**
   - **`isDbUnavailableError(err)`** – Classifies connection/timeout/schema errors (ECONNREFUSED, ETIMEDOUT, "does not exist", 57P01, 57P03, etc.).
   - **Try/catch around `searchFromDb()`** – On throw: log via `logSearchError("searchFromDb threw", dbErr)`, then return **503** if `isDbUnavailableError(dbErr)`, else **500**.
   - **Outer catch** – Uses `logSearchError("outer catch", err)` (message, code, stack) and returns **503** or **500** using the same classifier.
   - **User-facing message** – 503: "Search temporarily unavailable. Please try again later." 500: "An unexpected error occurred. Please try again later."

2. **Cron API**
   - **`isDbUnavailableError(err)`** and **`logCronError(context, err)`** – Same idea: classify DB unavailable, log structured.
   - **Outer catch** – Returns **503** with "Service temporarily unavailable" when `isDbUnavailableError(err)`, else **500** with "Ingestion failed", and logs via `logCronError("ingest failed", err)`.
   - **Job status update** – On failure, the `query(UPDATE ingestion_jobs...)` in the catch now uses `.catch((updateErr) => logCronError("failed to update job status", updateErr))` so update failures are logged and don’t mask the original error.

3. **No changes** to ingestion logic, Stripe, or YouTube API usage; only error handling and logging.

---

## Logging for Vercel

- **Search**: `console.error(\`[Search API Error] ${context}:\`, { message, code, stack })` so Vercel Runtime Logs show:
  - **message**: e.g. "connection refused", "relation \"videos\" does not exist".
  - **code**: e.g. ECONNREFUSED, ETIMEDOUT, 42P01.
  - **stack**: full stack trace.
- **Cron**: `console.error(\`[Cron Ingest Error] ${context}:\`, { message, code, stack })` with the same shape.

Where to look:

- **Vercel Dashboard** → Project → **Logs** (Runtime Logs).
- Filter by function: e.g. `/api/search` or `/api/cron/ingest`.
- Search for `[Search API Error]` or `[Cron Ingest Error]` to see the exact failure and stack.

---

## Checklist for production

- [ ] **DATABASE_URL** set in Vercel (Neon pooled URL).
- [ ] **Migrations run** on Neon (001 → 006) so `channels`, `keywords`, `videos`, `video_keywords`, `ingestion_jobs` exist.
- [ ] After deploy, trigger a search and check **Vercel Logs** for `[Search API Error]` if the user still sees an error; the log will show the real cause (e.g. missing table, connection refused).
