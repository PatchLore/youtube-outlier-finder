-- Videos: YouTube video records (outlier / breakout metadata)
-- Postgres-compatible

CREATE TABLE IF NOT EXISTS videos (
  id                BIGSERIAL PRIMARY KEY,
  youtube_video_id  VARCHAR(16) NOT NULL UNIQUE,
  channel_id        BIGINT NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
  title             TEXT,
  thumbnail_url     TEXT,
  views             BIGINT NOT NULL DEFAULT 0,
  published_at      TIMESTAMPTZ,
  multiplier        NUMERIC(10, 4),
  outlier_tier      TEXT[],
  views_per_day     NUMERIC(20, 4),
  like_ratio        NUMERIC(10, 6),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_youtube_id ON videos (youtube_video_id);
CREATE INDEX IF NOT EXISTS idx_videos_channel_id ON videos (channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_published_at ON videos (published_at);
CREATE INDEX IF NOT EXISTS idx_videos_multiplier ON videos (multiplier);

COMMENT ON TABLE videos IS 'YouTube video records with outlier/breakout metrics';
