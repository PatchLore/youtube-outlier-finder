-- Channels: YouTube channel records
-- Postgres-compatible

CREATE TABLE IF NOT EXISTS channels (
  id                BIGSERIAL PRIMARY KEY,
  youtube_channel_id VARCHAR(32) NOT NULL UNIQUE,
  title             TEXT,
  subscriber_count   BIGINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_youtube_id ON channels (youtube_channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_subscriber_count ON channels (subscriber_count);

COMMENT ON TABLE channels IS 'YouTube channel metadata';
