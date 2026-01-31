# Smoke tests

Run these after `npm run dev` (or against a deployed URL). Replace `http://localhost:3000` and `YOUR_CRON_SECRET` as needed.

## Test 1: Health check – does the app boot?

```bash
curl http://localhost:3000/api/health || echo "App not running"
```

Expected: `{"ok":true,"status":"ok"}` or "App not running" if the app is not running.

## Test 2: Auth check – 401 without session?

```bash
curl http://localhost:3000/api/videos
```

Expected: `401` with JSON body containing `"code":"AUTH_REQUIRED"` (or redirect if Clerk intercepts).

## Test 3: Ingest cron – does it run without crashing?

```bash
curl -X POST http://localhost:3000/api/cron/ingest \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected: `200` with JSON (e.g. `ok: true`, `message: "No keywords or queue items to ingest"` or similar).  
Check server logs for `[Cron Ingest]` and `quota_cost` being logged on completion.

## Test 4: Type check – does it compile?

```bash
npm run build
```

Expected: Build completes with **0 errors**. (If the build fails with EPERM/lockfile in your environment, run `npx tsc --noEmit` instead to verify types.)
