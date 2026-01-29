/**
 * Temporary: POST /api/admin/seed-keywords using CRON_SECRET from .env.production.local.
 * Uses NEXT_PUBLIC_APP_URL or VERCEL_URL as base.
 */
import { readFileSync } from "fs";
import { join } from "path";

const envPath = join(process.cwd(), ".env.production.local");
let env = "";
try {
  env = readFileSync(envPath, "utf8");
} catch (e) {
  console.error("Missing .env.production.local. Run: vercel env pull .env.production.local --environment=production");
  process.exit(1);
}

const envObj = {};
for (const line of env.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  let val = trimmed.slice(idx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
    val = val.slice(1, -1);
  envObj[key] = val;
}

const baseUrl = envObj.NEXT_PUBLIC_APP_URL || (envObj.VERCEL_URL ? `https://${envObj.VERCEL_URL}` : null);
const secret = envObj.ADMIN_SECRET || envObj.CRON_SECRET;
if (!baseUrl) {
  console.error("NEXT_PUBLIC_APP_URL or VERCEL_URL not found in .env.production.local");
  process.exit(1);
}
if (!secret) {
  console.error("ADMIN_SECRET or CRON_SECRET not found in .env.production.local");
  process.exit(1);
}

const url = baseUrl.replace(/\/$/, "") + "/api/admin/seed-keywords";
console.log("POST", url);
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
});
const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = { raw: text };
}
console.log("Status:", res.status, res.statusText);
console.log("Response:", JSON.stringify(body, null, 2));
process.exit(res.ok ? 0 : 1);
