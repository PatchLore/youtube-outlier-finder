/**
 * Neon / Postgres client using ONLY process.env.DATABASE_URL.
 * Ignores: PGHOST, POSTGRES_URL, POSTGRES_PRISMA_URL, DATABASE_URL_UNPOOLED.
 *
 * Lazy-loaded singleton: the Pool is created on first getPool() call (not at module load),
 * so serverless and build-time never touch the DB until a request runs.
 * Connection string is passed through to pg; Neon pooled URLs work as-is (SSL required for Neon).
 *
 * If DATABASE_URL is missing, getPool() returns null and query() throws; callers return 503.
 */

import { Pool } from "pg";

let pool: Pool | null = null;

function createPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (typeof url !== "string" || url.trim() === "") return null;
  const isLocal = url.includes("localhost");
  return new Pool({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
}

/**
 * Returns the singleton Pool, creating it on first call (lazy). Uses DATABASE_URL only.
 */
export function getPool(): Pool | null {
  if (pool === null) {
    pool = createPool();
  }
  return pool;
}

/**
 * Run a parameterized query. Use the generic for typed rows, e.g. query<Video>("SELECT * FROM videos ...").
 */
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const p = getPool();
  if (!p) {
    throw new Error("DATABASE_URL is not set");
  }
  const result = await p.query(text, params);
  return { rows: (result.rows as T[]) ?? [], rowCount: result.rowCount ?? 0 };
}

export type { Video, Keyword, User, Channel, IngestionJob, VideoSearchRow } from "@/types/database";
