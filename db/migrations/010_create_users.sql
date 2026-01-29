-- Users: plan gating for search (free vs pro). Synced by Stripe webhook.
-- Postgres-compatible. Idempotent.

CREATE TABLE IF NOT EXISTS users (
  id                BIGSERIAL PRIMARY KEY,
  clerk_user_id     TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  plan              TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users (clerk_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

COMMENT ON TABLE users IS 'User plan (free/pro) for search gating; updated by Stripe subscription webhooks';
