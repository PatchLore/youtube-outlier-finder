/**
 * One-off: list public tables and show schema for users + keywords.
 * Loads DATABASE_URL from .env.local if present.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";
const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv(path) {
  try {
    const env = readFileSync(path, "utf8");
    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (key === "DATABASE_URL") process.env.DATABASE_URL = val;
    }
  } catch (_) {}
}
const tried = [
  join(root, ".env.local"),
  join(process.cwd(), ".env.local"),
  join(root, ".env"),
  join(process.cwd(), ".env"),
];
for (const p of tried) {
  loadEnv(p);
  if (process.env.DATABASE_URL) break;
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set. Add DATABASE_URL to .env.local in the project root, or set the env var.");
  console.error("Tried:", tried.join(", "));
  process.exit(1);
}

const url = process.env.DATABASE_URL;
const isLocal = url.includes("localhost");
const client = new Client({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

await client.connect();

const tablesRes = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
);
console.log("Tables:", tablesRes.rows.map((r) => r.table_name).join(", ") || "(none)");

const usersCols = await client.query(
  "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' ORDER BY ordinal_position"
);
console.log("\n--- users ---");
if (usersCols.rows.length === 0) console.log("(table does not exist)");
else usersCols.rows.forEach((r) => console.log(`  ${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`));

const keywordsCols = await client.query(
  "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'keywords' ORDER BY ordinal_position"
);
console.log("\n--- keywords ---");
if (keywordsCols.rows.length === 0) console.log("(table does not exist)");
else keywordsCols.rows.forEach((r) => console.log(`  ${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`));

await client.end();
