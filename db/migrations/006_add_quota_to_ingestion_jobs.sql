-- Add quota tracking to ingestion_jobs for daily limit protection
-- Postgres-compatible

ALTER TABLE ingestion_jobs
  ADD COLUMN IF NOT EXISTS quota_units_used INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_completed_at_date
  ON ingestion_jobs ((completed_at::date));

COMMENT ON COLUMN ingestion_jobs.quota_units_used IS 'Estimated YouTube API quota units consumed by this job (search=100, videos=1, channels=1 per keyword)';
