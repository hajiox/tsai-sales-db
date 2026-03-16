// app/api/finance/import-status/route.ts
// 月別インポート状態を返すAPI — DB側で集計（Supabase 1000行制限回避）
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GlobalWithPool = typeof globalThis & { __pgPoolFinanceStatus?: Pool };
const g = globalThis as GlobalWithPool;
const pool =
  g.__pgPoolFinanceStatus ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 30_000,
  });
g.__pgPoolFinanceStatus = pool;

export interface MonthStatus {
  month: string;           // "2025-01"
  accountCount: number;
  transactionCount: number;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

export async function GET() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        TO_CHAR(report_month, 'YYYY-MM') AS month,
        COUNT(*)::int AS account_count,
        COALESCE(SUM(transaction_count), 0)::bigint AS total_transactions,
        COALESCE(SUM(total_debit), 0)::bigint AS total_debit,
        COALESCE(SUM(total_credit), 0)::bigint AS total_credit
      FROM monthly_account_balance
      GROUP BY report_month
      ORDER BY report_month;
    `);

    const months: MonthStatus[] = rows.map((r: any) => ({
      month: r.month,
      accountCount: Number(r.account_count),
      transactionCount: Number(r.total_transactions),
      totalDebit: Number(r.total_debit),
      totalCredit: Number(r.total_credit),
      isBalanced: Number(r.total_debit) === Number(r.total_credit),
    }));

    return NextResponse.json({ months }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'internal error' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
