-- Add niche and priority to keywords for categorization and commercial intent
-- Postgres-compatible. Idempotent.

ALTER TABLE keywords
  ADD COLUMN IF NOT EXISTS niche VARCHAR(100) NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 2;

-- Backfill niche for any existing rows (if column was added without default in the past)
UPDATE keywords SET niche = 'general' WHERE niche IS NULL;

-- Replace single-column unique with composite (keyword, niche)
ALTER TABLE keywords DROP CONSTRAINT IF EXISTS keywords_keyword_key;
ALTER TABLE keywords DROP CONSTRAINT IF EXISTS keywords_keyword_niche_key;
ALTER TABLE keywords ADD CONSTRAINT keywords_keyword_niche_key UNIQUE (keyword, niche);
-- (If ADD fails because constraint exists, re-run is safe: we dropped it above.)

CREATE INDEX IF NOT EXISTS idx_keywords_niche ON keywords (niche);
CREATE INDEX IF NOT EXISTS idx_keywords_priority ON keywords (priority);

COMMENT ON COLUMN keywords.niche IS 'Category: Finance, AI tools, Ecommerce, Fitness, Content Creation';
COMMENT ON COLUMN keywords.priority IS 'Commercial intent 1-3 (3 = high)';
