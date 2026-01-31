-- Add api_calls and quota_cost to ingestion_jobs for per-call quota tracking
-- Postgres-compatible
-- Units: search=100, videos=1, channels=1 per request

ALTER TABLE ingestion_jobs
  ADD COLUMN IF NOT EXISTS api_calls INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ingestion_jobs
  ADD COLUMN IF NOT EXISTS quota_cost INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN ingestion_jobs.api_calls IS 'Number of YouTube API calls made by this job (search, videos.list, channels.list)';
COMMENT ON COLUMN ingestion_jobs.quota_cost IS 'YouTube API quota units consumed (search=100, videos=1, channels=1 per call)';
