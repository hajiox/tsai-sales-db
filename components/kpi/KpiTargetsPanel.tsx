// Server Component：DB直読み（テーブルが無くても落ちない）
import { pool } from '@/lib/db';

function currentFY() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return m >= 8 ? y : y - 1;
}
const yen = (n: number) => (Number(n) || 0).toLocaleString('ja-JP');

export default async function KpiTargetsPanel({ fy }: { fy?: number }) {
  const fyVal = fy ?? currentFY();

  const client = await pool.connect();
  try {
    const chk = await client.query<{ exists: boolean }>(
      "select (to_regclass('kpi.kpi_targets_fy_v1') is not null) as exists"
    );
    const hasTargets = chk.rows[0]?.exists === true;

    const base = `
      WITH fy AS (
        SELECT make_date($1::int,8,1)::date AS fy_start, make_date(($1::int)+1,8,1)::date AS fy_end_excl
      ),
      months AS (
        SELECT generate_series(fy_start, fy_end_excl - interval '1 month', '1 month')::date AS m FROM fy
      ),
      u AS (
        SELECT CASE
                 WHEN UPPER(BTRIM(channel_code)) IN ('STORE','SHOP','RETAIL','STORE_FRONT') THEN 'STORE'
                 WHEN UPPER(BTRIM(channel_code)) IN ('WHOLESALE','OEM') THEN 'WHOLESALE'
                 ELSE UPPER(BTRIM(channel_code))
               END AS ch,
               month::date AS month,
               COALESCE(amount,0)::numeric AS amount
        FROM kpi.kpi_sales_monthly_unified_v1, fy
        WHERE month >= fy_start AND month < fy_end_excl
      )
    `;
    const sql = hasTargets
      ? `
      ${base}
      SELECT m.m::date AS month,
             COALESCE(SUM(u.amount),0)                   AS total_all,
             COALESCE(SUM(t.target_amount),0)            AS target_total,
             COALESCE(SUM(t.last_year_amount),0)         AS last_year_total
      FROM months m
      LEFT JOIN u ON u.month = m.m
      LEFT JOIN kpi.kpi_targets_fy_v1 t ON t.fy = $1 AND t.month = m.m
      GROUP BY 1 ORDER BY 1;
    `
      : `
      ${base}
      SELECT m.m::date AS month,
             COALESCE(SUM(u.amount),0) AS total_all,
             0::numeric                 AS target_total,
             0::numeric                 AS last_year_total
      FROM months m LEFT JOIN u ON u.month = m.m
      GROUP BY 1 ORDER BY 1;
    `;

    const { rows } = await client.query(sql, [fyVal]);
    type Row = { month: string; total_all: number; target_total: number; last_year_total: number };
    const data = rows as Row[];

    const ytdAll = data.reduce((s, r) => s + Number(r.total_all), 0);
    const ytdTarget = data.reduce((s, r) => s + Number(r.target_total), 0);
    const ytdLast = data.reduce((s, r) => s + Number(r.last_year_total), 0);
    const ytdAchv = ytdTarget > 0 ? (ytdAll / ytdTarget) * 100 : null;

    return (
      <section className="mt-6">
        <div className="flex items-end justify-between mb-2">
          <h2 className="text-lg font-semibold">目標／前年／達成率（FY{fyVal}）</h2>
          <div className="text-xs text-neutral-500">
            参照: kpi.kpi_sales_monthly_unified_v1{hasTargets ? ' ＋ kpi.kpi_targets_fy_v1' : ''}
          </div>
        </div>

        {/* サマリー */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div className="rounded-2xl border p-3">
            <div className="text-xs text-neutral-500 mb-1">年間目標</div>
            <div className="text-xl font-semibold">¥{yen(ytdTarget)}</div>
          </div>
          <div className="rounded-2xl border p-3">
            <div className="text-xs text-neutral-500 mb-1">年間実績</div>
            <div className="text-xl font-semibold">¥{yen(ytdAll)}</div>
          </div>
          <div className="rounded-2xl border p-3">
            <div className="text-xs text-neutral-500 mb-1">達成率</div>
            <div className="text-xl font-semibold">{ytdAchv == null ? '—' : `${ytdAchv.toFixed(1)}%`}</div>
          </div>
          <div className="rounded-2xl border p-3">
            <div className="text-xs text-neutral-500 mb-1">前年合計</div>
            <div className="text-xl font-semibold">¥{yen(ytdLast)}</div>
          </div>
        </div>

        {/* 月別テーブル（合計・目標・達成率・前年） */}
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[760px] w-full border-collapse">
            <thead className="bg-white sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2 border-b">月</th>
                <th className="text-right px-3 py-2 border-b">合計</th>
                <th className="text-right px-3 py-2 border-b">目標</th>
                <th className="text-right px-3 py-2 border-b">達成率(%)</th>
                <th className="text-right px-3 py-2 border-b">前年</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const d = new Date(r.month);
                const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
                const ach = r.target_total > 0 ? (Number(r.total_all) / Number(r.target_total)) * 100 : null;
                return (
                  <tr key={r.month} className="odd:bg-neutral-50/30">
                    <td className="text-left px-3 py-2 border-t">{ym}</td>
                    <td className="text-right px-3 py-2 border-t">¥{yen(r.total_all)}</td>
                    <td className="text-right px-3 py-2 border-t">¥{yen(r.target_total)}</td>
                    <td className="text-right px-3 py-2 border-t">{ach == null ? '—' : ach.toFixed(1)}</td>
                    <td className="text-right px-3 py-2 border-t">¥{yen(r.last_year_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  } finally {
    (client as any).release?.();
  }
}
