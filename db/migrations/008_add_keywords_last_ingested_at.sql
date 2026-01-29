-- Track when each keyword was last ingested (for 24h cooldown)
-- Postgres-compatible. Idempotent.

ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS last_ingested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_keywords_last_ingested_at ON keywords (last_ingested_at);

COMMENT ON COLUMN keywords.last_ingested_at IS 'Last time this keyword was processed by cron ingest; used to pick keywords not updated in 24h';
