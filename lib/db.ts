// /lib/db.ts
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL!;
export const pool = new Pool({
  connectionString,
  ssl: connectionString && !connectionString.includes('sslmode=disable')
    ? { rejectUnauthorized: false }
    : undefined,
});

export async function query<T = any>(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return { rows: res.rows as T[] };
  } finally {
    client.release();
  }
}
