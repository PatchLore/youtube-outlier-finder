-- Sync repo with DB: niche was added manually. Idempotent.
-- (Migration 007 also adds niche as VARCHAR(100); this covers manual ADD COLUMN niche TEXT.)

ALTER TABLE keywords ADD COLUMN IF NOT EXISTS niche TEXT;
