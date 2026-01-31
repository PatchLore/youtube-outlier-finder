-- Priority ingestion queue: Pro users can request keyword scans (e.g. /api/scan/request)
-- Postgres-compatible

CREATE TABLE IF NOT EXISTS priority_ingestion_queue (
  id            BIGSERIAL PRIMARY KEY,
  keyword       VARCHAR(200) NOT NULL,
  requested_by  VARCHAR(64),                           -- clerk_user_id
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  processed_at  TIMESTAMPTZ,
  priority      SMALLINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_priority_ingestion_queue_status ON priority_ingestion_queue (status);
CREATE INDEX IF NOT EXISTS idx_priority_ingestion_queue_requested_at ON priority_ingestion_queue (requested_at);
CREATE INDEX IF NOT EXISTS idx_priority_ingestion_queue_keyword_status ON priority_ingestion_queue (keyword, status);

COMMENT ON TABLE priority_ingestion_queue IS 'Pro-only queue for on-demand keyword scan requests';
