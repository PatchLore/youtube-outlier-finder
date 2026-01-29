import { Pool } from "pg";

const pool =
  typeof process.env.DATABASE_URL !== "undefined"
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
      })
    : null;

export function getPool(): Pool | null {
  return pool;
}

export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  if (!pool) {
    throw new Error("DATABASE_URL is not set");
  }
  const result = await pool.query(text, params);
  return { rows: (result.rows as T[]) || [], rowCount: result.rowCount ?? 0 };
}
