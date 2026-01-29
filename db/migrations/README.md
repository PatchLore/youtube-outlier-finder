# Postgres migrations (Neon / DATABASE_URL)

Run these in order against your Neon (or any Postgres) database. All statements are idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

**Connection:** Use `DATABASE_URL` only (pooled URL recommended for Neon).

**Order:**

1. `001_create_channels.sql`
2. `002_create_keywords.sql`
3. `003_create_videos.sql`
4. `004_create_video_keywords.sql`
5. `005_create_ingestion_jobs.sql`
6. `006_add_quota_to_ingestion_jobs.sql`
7. `007_add_keyword_niche_priority.sql` (adds `niche`, `priority`; unique on `(keyword, niche)`)
8. `008_add_keywords_last_ingested_at.sql` (adds `last_ingested_at` for cron 24h cooldown)
9. `009_add_videos_outlier_score.sql` (adds `outlier_score` for composite score)
10. `010_create_users.sql` (users table: clerk_user_id, stripe_customer_id, plan for search gating)

**Example (psql):**

```bash
psql "$DATABASE_URL" -f db/migrations/001_create_channels.sql
psql "$DATABASE_URL" -f db/migrations/002_create_keywords.sql
psql "$DATABASE_URL" -f db/migrations/003_create_videos.sql
psql "$DATABASE_URL" -f db/migrations/004_create_video_keywords.sql
psql "$DATABASE_URL" -f db/migrations/005_create_ingestion_jobs.sql
psql "$DATABASE_URL" -f db/migrations/006_add_quota_to_ingestion_jobs.sql
psql "$DATABASE_URL" -f db/migrations/007_add_keyword_niche_priority.sql
psql "$DATABASE_URL" -f db/migrations/008_add_keywords_last_ingested_at.sql
psql "$DATABASE_URL" -f db/migrations/009_add_videos_outlier_score.sql
psql "$DATABASE_URL" -f db/migrations/010_create_users.sql
```

Or run all in one go (Bash):

```bash
for f in db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```
