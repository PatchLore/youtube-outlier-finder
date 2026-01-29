/**
 * Temporary audit script: verify users.plan and keywords.last_ingested_at exist.
 * Loads DATABASE_URL from .env.production.local (from vercel env pull).
 */
import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";
const { Client } = pg;

const envPath = join(process.cwd(), ".env.production.local");
let env = "";
try {
  env = readFileSync(envPath, "utf8");
} catch (e) {
  console.error("Missing .env.production.local. Run: vercel env pull .env.production.local --environment=production");
  process.exit(1);
}

for (const line of env.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  let val = trimmed.slice(idx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
    val = val.slice(1, -1);
  process.env[key] = val;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not found in .env.production.local");
  process.exit(1);
}

const isLocal = url.includes("localhost");
const client = new Client({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

await client.connect();

// List tables
const tablesRes = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
);
console.log("Tables:", tablesRes.rows.map((r) => r.table_name).join(", ") || "(none)");

// users: check for plan
const usersCols = await client.query(
  "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' ORDER BY ordinal_position"
);
const usersHasPlan = usersCols.rows.some((r) => r.column_name === "plan");
console.log("\n--- users ---");
if (usersCols.rows.length === 0) {
  console.log("(table does not exist)");
} else {
  usersCols.rows.forEach((r) =>
    console.log(`  ${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`)
  );
  console.log("  plan column present:", usersHasPlan ? "YES" : "NO");
}

// keywords: check for last_ingested_at
const keywordsCols = await client.query(
  "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'keywords' ORDER BY ordinal_position"
);
const keywordsHasLastIngested = keywordsCols.rows.some((r) => r.column_name === "last_ingested_at");
console.log("\n--- keywords ---");
if (keywordsCols.rows.length === 0) {
  console.log("(table does not exist)");
} else {
  keywordsCols.rows.forEach((r) =>
    console.log(`  ${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`)
  );
  console.log("  last_ingested_at column present:", keywordsHasLastIngested ? "YES" : "NO");
}

await client.end();

const migrationsLive = usersHasPlan && keywordsHasLastIngested;
console.log("\nMigrations (users.plan + keywords.last_ingested_at) live:", migrationsLive ? "YES" : "NO");
process.exit(migrationsLive ? 0 : 1);
