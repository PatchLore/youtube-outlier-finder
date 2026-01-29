/**
 * Full audit: verify env keys, run check-db.mjs, run seed attempt, then cleanup.
 * Requires: .env.production.local (from vercel env pull .env.production.local --environment=production)
 */
import { readFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const root = process.cwd();
const envPath = join(root, ".env.production.local");

if (!existsSync(envPath)) {
  console.error("Missing .env.production.local.");
  console.error("Run: vercel env pull .env.production.local --environment=production");
  process.exit(1);
}

const envContent = readFileSync(envPath, "utf8");
const hasCronSecret = /\bCRON_SECRET\s*=/.test(envContent);
const hasStripeWebhookSecret = /\bSTRIPE_WEBHOOK_SECRET\s*=/.test(envContent);
console.log("Env keys in .env.production.local:");
console.log("  CRON_SECRET present:", hasCronSecret);
console.log("  STRIPE_WEBHOOK_SECRET present:", hasStripeWebhookSecret);
if (!hasCronSecret || !hasStripeWebhookSecret) {
  console.error("Add missing keys in Vercel project env, then re-pull.");
  process.exit(1);
}

console.log("\n--- DB schema check (check-db.mjs) ---");
const dbResult = spawnSync("node", ["check-db.mjs"], { cwd: root, stdio: "inherit" });
const migrationsLive = dbResult.status === 0;

console.log("\n--- Seed attempt ---");
const seedResult = spawnSync("node", ["seed-attempt.mjs"], { cwd: root, stdio: "inherit" });
const seedOk = seedResult.status === 0;

console.log("\n--- Audit summary ---");
console.log("Migrations live (users.plan + keywords.last_ingested_at):", migrationsLive ? "YES" : "NO");
console.log("Seed successful:", seedOk ? "YES" : "NO");

console.log("\nCleanup: removing .env.production.local and check-db.mjs");
try {
  unlinkSync(envPath);
  console.log("  Deleted .env.production.local");
} catch (e) {
  console.warn("  Could not delete .env.production.local:", e.message);
}
try {
  unlinkSync(join(root, "check-db.mjs"));
  console.log("  Deleted check-db.mjs");
} catch (e) {
  console.warn("  Could not delete check-db.mjs:", e.message);
}

process.exit(migrationsLive && seedOk ? 0 : 1);
