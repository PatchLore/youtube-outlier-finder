-- Video-keyword join table: many-to-many between videos and keywords
-- Postgres-compatible

CREATE TABLE IF NOT EXISTS video_keywords (
  video_id   BIGINT NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
  keyword_id BIGINT NOT NULL REFERENCES keywords (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (video_id, keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_video_keywords_video_id ON video_keywords (video_id);
CREATE INDEX IF NOT EXISTS idx_video_keywords_keyword_id ON video_keywords (keyword_id);

COMMENT ON TABLE video_keywords IS 'Join table linking videos to keywords';
