import { query } from "@/lib/db/pool";

export { pool } from "@/lib/db/pool";

export type WholesaleOemOverview = {
  confirmed_lines: number;
  confirmed_amount: number;
  oem_lines: number;
  oem_amount: number;
  total_lines: number;
  total_amount: number;
};

function normalizeOverview(row: Record<string, unknown> | undefined): WholesaleOemOverview {
  if (!row) {
    throw new Error("overview not found");
  }

  return {
    confirmed_lines: Number(row.confirmed_lines ?? 0),
    confirmed_amount: Number(row.confirmed_amount ?? 0),
    oem_lines: Number(row.oem_lines ?? 0),
    oem_amount: Number(row.oem_amount ?? 0),
    total_lines: Number(row.total_lines ?? 0),
    total_amount: Number(row.total_amount ?? 0),
  };
}

/** 月初(YYYY-MM-01)を渡して、合算(卸確定+OEM)の月次サマリを取得 */
export async function getWholesaleOemOverview(monthStart: string): Promise<WholesaleOemOverview> {
  const sql = "select * from kpi.wholesale_oem_monthly_overview_v2($1)";
  const { rows } = await query(sql, [monthStart]);
  return normalizeOverview(rows[0]);
}

/** 合計金額のみが必要な場合 */
export async function getWholesaleOemTotal(monthStart: string): Promise<number> {
  const sql = "select total_amount from kpi.wholesale_oem_monthly_overview_v2($1)";
  const { rows } = await query<{ total_amount: number | string | null }>(sql, [monthStart]);
  const value = rows[0]?.total_amount;
  return Number(value ?? 0);
}
