-- Ingestion jobs: track fetch/process jobs (e.g. YouTube API, backfills)
-- Postgres-compatible

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id           BIGSERIAL PRIMARY KEY,
  status       VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  job_type     VARCHAR(64),                            -- e.g. 'youtube_search', 'channel_backfill'
  query        TEXT,                                   -- search query or job input
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata     JSONB,                                  -- extra payload (counts, filters, etc.)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs (status);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_created_at ON ingestion_jobs (created_at);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_job_type ON ingestion_jobs (job_type);

COMMENT ON TABLE ingestion_jobs IS 'Tracks ingestion/crawl jobs for YouTube or other sources';
