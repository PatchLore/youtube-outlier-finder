/**
 * Schema audit: query information_schema, report tables/columns/PKs/FKs/indexes,
 * check for video_stats, priority_ingestion_queue, id types, missing columns.
 * Writes scripts/fix-schema.sql (DROP unwanted tables, ALTER missing columns).
 * Run: node scripts/schema-audit.mjs (requires DATABASE_URL in .env.local or .env)
 */

import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";
const { Client } = pg;

const root = join(process.cwd());
const scriptsDir = join(root, "scripts");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const env = readFileSync(join(root, name), "utf8");
      for (const line of env.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const idx = t.indexOf("=");
        if (idx === -1) continue;
        const key = t.slice(0, idx).trim();
        let val = t.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
          val = val.slice(1, -1);
        process.env[key] = val;
      }
      if (process.env.DATABASE_URL) break;
    } catch (_) {}
  }
}

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set. Add to .env.local or .env.");
  process.exit(1);
}

const client = new Client({
  connectionString: url,
  ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
});

/** Expected tables and their PK column type (from migrations 001-011). */
const EXPECTED_TABLES = ["channels", "keywords", "videos", "video_keywords", "ingestion_jobs", "users"];

/** Tables that should NOT exist (half-created / legacy). */
const UNWANTED_TABLES = ["video_stats", "priority_ingestion_queue"];

/** Expected PK id type: migrations use BIGSERIAL -> bigint. */
const EXPECTED_ID_TYPE = "bigint";

/** Expected columns per table (from migrations). Only columns we care to check. */
const EXPECTED_COLUMNS = {
  channels: ["id", "youtube_channel_id", "title", "subscriber_count", "created_at", "updated_at"],
  keywords: ["id", "keyword", "created_at", "niche", "priority", "last_ingested_at"],
  videos: ["id", "youtube_video_id", "channel_id", "title", "thumbnail_url", "views", "published_at", "multiplier", "outlier_tier", "views_per_day", "like_ratio", "created_at", "updated_at", "outlier_score"],
  video_keywords: ["video_id", "keyword_id", "created_at"],
  ingestion_jobs: ["id", "status", "job_type", "query", "started_at", "completed_at", "error_message", "metadata", "created_at", "updated_at", "quota_units_used", "api_calls", "quota_cost"],
  users: ["id", "clerk_user_id", "stripe_customer_id", "plan", "created_at", "updated_at"],
};

async function run() {
  await client.connect();

  const tablesRes = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  const tablesFound = tablesRes.rows.map((r) => r.table_name);

  const report = { tables: {}, pkTypes: {}, fks: {}, indexes: {} };
  const typeMismatches = [];
  const missingColumns = {};
  const fixSql = [];

  for (const tableName of tablesFound) {
    const colsRes = await client.query(
      `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    );
    report.tables[tableName] = colsRes.rows;

    const pkRes = await client.query(
      `SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) AND NOT a.attisdropped
       WHERE i.indrelid = $1::regclass AND i.indisprimary`,
      [tableName]
    );
    if (pkRes.rows.length > 0) {
      report.pkTypes[tableName] = pkRes.rows;
      if ((tableName === "videos" || tableName === "channels") && pkRes.rows.length === 1) {
        const row = pkRes.rows[0];
        const type = (row.type || "").toLowerCase();
        if (!type.includes("int8") && !type.includes("bigint")) {
          typeMismatches.push(`${tableName}.id is ${row.type}, expected ${EXPECTED_ID_TYPE}`);
        }
      }
    }

    const fkRes = await client.query(
      `SELECT
         tc.constraint_name, tc.table_name, kcu.column_name,
         ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = $1`,
      [tableName]
    );
    report.fks[tableName] = fkRes.rows;

    const idxRes = await client.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1`,
      [tableName]
    );
    report.indexes[tableName] = idxRes.rows;
  }

  const tablesMissing = EXPECTED_TABLES.filter((t) => !tablesFound.includes(t));
  const unwantedFound = UNWANTED_TABLES.filter((t) => tablesFound.includes(t));

  for (const tableName of EXPECTED_TABLES) {
    if (!tablesFound.includes(tableName)) continue;
    const expected = EXPECTED_COLUMNS[tableName];
    if (!expected) continue;
    const existing = new Set((report.tables[tableName] || []).map((r) => r.column_name));
    const missing = expected.filter((c) => !existing.has(c));
    if (missing.length > 0) {
      missingColumns[tableName] = missing;
    }
  }

  if (unwantedFound.length > 0) {
    for (const t of unwantedFound) {
      fixSql.push(`DROP TABLE IF EXISTS ${t} CASCADE;`);
    }
  }
  for (const [table, cols] of Object.entries(missingColumns)) {
    for (const col of cols) {
      const safe = table;
      if (table === "keywords" && col === "niche") fixSql.push(`ALTER TABLE ${safe} ADD COLUMN IF NOT EXISTS niche VARCHAR(100) NOT NULL DEFAULT 'general';`);
      else if (table === "keywords" && col === "priority") fixSql.push(`ALTER TABLE ${safe} ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 2;`);
      else if (table === "keywords" && col === "last_ingested_at") fixSql.push(`ALTER TABLE ${safe} ADD COLUMN IF NOT EXISTS last_ingested_at TIMESTAMPTZ;`);
      else if (table === "videos" && col === "outlier_score") fixSql.push(`ALTER TABLE ${safe} ADD COLUMN IF NOT EXISTS outlier_score NUMERIC(14, 4);`);
      else if (table === "ingestion_jobs" && col === "quota_units_used") fixSql.push(`ALTER TABLE ${safe} ADD COLUMN IF NOT EXISTS quota_units_used INTEGER NOT NULL DEFAULT 0;`);
      else if (table === "ingestion_jobs" && col === "api_calls") fixSql.push(`ALTER TABLE ${safe} ADD COLUMN IF NOT EXISTS api_calls INTEGER NOT NULL DEFAULT 0;`);
      else if (table === "ingestion_jobs" && col === "quota_cost") fixSql.push(`ALTER TABLE ${safe} ADD COLUMN IF NOT EXISTS quota_cost INTEGER NOT NULL DEFAULT 0;`);
      else fixSql.push(`-- ALTER TABLE ${safe} ADD COLUMN IF NOT EXISTS ${col} <type>;  -- add type and run manually`);
    }
  }

  const fixPath = join(scriptsDir, "fix-schema.sql");
  const fixContent = [
    "-- Generated by scripts/schema-audit.mjs. Review before running.",
    "-- DROP unwanted tables (half-created / legacy).",
    "",
    ...(unwantedFound.length > 0 ? fixSql.filter((s) => s.startsWith("DROP")) : ["-- No unwanted tables to drop."]),
    "",
    "-- ALTER: add missing columns (idempotent).",
    ...(Object.keys(missingColumns).length > 0 ? fixSql.filter((s) => s.startsWith("ALTER")) : ["-- No missing columns to add."]),
    "",
    "-- If expected tables are missing, run db/migrations 001-011 in order.",
  ].join("\n");
  await import("fs").then((fs) => fs.promises.writeFile(fixPath, fixContent, "utf8"));

  console.log("\n=== Schema Audit Report ===\n");
  console.log("Tables found:", tablesFound.length ? tablesFound.join(", ") : "(none)");
  console.log("Tables missing (expected from migrations):", tablesMissing.length ? tablesMissing.join(", ") : "(none)");
  console.log("Unwanted tables present (will DROP in fix-schema.sql):", unwantedFound.length ? unwantedFound.join(", ") : "(none)");
  console.log("Type mismatches detected:", typeMismatches.length ? typeMismatches : "(none)");
  console.log("Missing columns (per table):", Object.keys(missingColumns).length ? JSON.stringify(missingColumns, null, 2) : "(none)");

  console.log("\n--- Details per table ---");
  for (const tableName of tablesFound) {
    const cols = report.tables[tableName] || [];
    const pks = report.pkTypes[tableName] || [];
    const fks = report.fks[tableName] || [];
    const idxs = report.indexes[tableName] || [];
    console.log(`\n${tableName}:`);
    console.log("  Columns:", cols.map((c) => `${c.column_name} (${c.data_type})`).join(", "));
    console.log("  Primary key:", pks.map((p) => `${p.attname} (${p.type})`).join(", ") || "—");
    console.log("  Foreign keys:", fks.length ? fks.map((f) => `${f.column_name} -> ${f.foreign_table_name}.${f.foreign_column_name}`).join("; ") : "—");
    console.log("  Indexes:", idxs.length ? idxs.map((i) => i.indexname).join(", ") : "—");
  }

  console.log("\n--- Specific checks ---");
  console.log("  video_stats table exists:", tablesFound.includes("video_stats"));
  console.log("  priority_ingestion_queue table exists:", tablesFound.includes("priority_ingestion_queue"));
  const videosId = (report.tables.videos || []).find((c) => c.column_name === "id");
  console.log("  videos.id type:", videosId ? videosId.data_type : "—");
  const channelsId = (report.tables.channels || []).find((c) => c.column_name === "id");
  console.log("  channels.id type:", channelsId ? channelsId.data_type : "—");

  console.log("\nfix-schema.sql written to:", fixPath);

  console.log("\n=== Summary ===");
  console.log("Tables found:", tablesFound.length ? tablesFound.join(", ") : "(none)");
  console.log("Tables missing:", tablesMissing.length ? tablesMissing.join(", ") : "(none)");
  console.log("Type mismatches detected:", typeMismatches.length ? typeMismatches : "(none)");

  await client.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
