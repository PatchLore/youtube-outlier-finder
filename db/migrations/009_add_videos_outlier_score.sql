-- Outlier score from calculateOutlierScore (base * confidence * freshness * channel penalty)
-- Postgres-compatible. Idempotent.

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS outlier_score NUMERIC(14, 4);

CREATE INDEX IF NOT EXISTS idx_videos_outlier_score ON videos (outlier_score DESC NULLS LAST);

COMMENT ON COLUMN videos.outlier_score IS 'Composite outlier score from views/subs, log10(views), freshness, channel penalty';
