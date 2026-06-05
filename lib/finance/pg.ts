import { Pool } from 'pg';

type GlobalWithFinancePool = typeof globalThis & {
  __tsaFinancePool?: Pool;
};

export function getFinancePool() {
  const globalForPool = globalThis as GlobalWithFinancePool;

  if (!globalForPool.__tsaFinancePool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }

    globalForPool.__tsaFinancePool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30_000,
    });
  }

  return globalForPool.__tsaFinancePool;
}
