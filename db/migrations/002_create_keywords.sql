-- Keywords: search terms / tags for categorization
-- Postgres-compatible

CREATE TABLE IF NOT EXISTS keywords (
  id         BIGSERIAL PRIMARY KEY,
  keyword    VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON keywords (keyword);

COMMENT ON TABLE keywords IS 'Keywords or search terms used for tagging videos';
