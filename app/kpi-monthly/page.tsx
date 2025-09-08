// app/kpi-monthly/page.tsx
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  channel_code: string;
  fiscal_month: string; // YYYY-MM-01（月初）
  actual_amount_yen: string | number; // numeric が string で返る場合あり
};

// Postgres プール（モジュールスコープで1つ）
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const fmtJPY = (v: string | number) => {
  const n = typeof v === "string" ? Number(v) : v;
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(n ?? 0);
};

async function fetchMonthlyKPI(limit = 200) {
  const sql = `
    SELECT channel_code, fiscal_month, actual_amount_yen
    FROM kpi.kpi_sales_monthly_computed_v2
    ORDER BY fiscal_month DESC, channel_code ASC
    LIMIT $1
  `;
  const { rows } = await pool.query<Row>(sql, [limit]);
  return rows;
}

export default async function Page() {
  const data = await fetchMonthlyKPI(200);

  const rows = data.map((r) => ({
    ...r,
    ym: r.fiscal_month?.slice(0, 7) ?? r.fiscal_month, // YYYY-MM
  }));

  const groups = rows.reduce((acc, row) => {
    (acc[row.ym] ||= []).push(row);
    return acc;
  }, {} as Record<string, Row[]>);

  const months = Object.keys(groups); // すでに降順の想定

  return (
    <main className="p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">売上KPI（月次・チャネル別）</h1>
        <p className="text-sm text-neutral-500">
          Source: <code>kpi.kpi_sales_monthly_computed_v2</code>（参照のみ）
        </p>
      </header>

      {months.length === 0 ? (
        <div className="text-sm text-neutral-500">データがありません。</div>
      ) : (
        months.map((ym) => (
          <section key={ym} className="space-y-2">
            <h2 className="text-lg font-medium">{ym}</h2>
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-[560px] w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr className="text-left">
                    <th className="px-4 py-2 w-[160px]">channel_code</th>
                    <th className="px-4 py-2 w-[160px]">fiscal_month</th>
                    <th className="px-4 py-2 text-right">actual_amount_yen</th>
                  </tr>
                </thead>
                <tbody>
                  {groups[ym].map((r, i) => (
                    <tr key={`${ym}-${r.channel_code}-${i}`} className="border-t">
                      <td className="px-4 py-2">{r.channel_code}</td>
                      <td className="px-4 py-2">{ym}</td>
                      <td className="px-4 py-2 text-right">
                        {fmtJPY(r.actual_amount_yen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </main>
  );
}
