import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DBRow = {
  channel_code: string;
  fiscal_month: any; // Date|string|null など想定
  actual_amount_yen: string | number;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function toYYYYMM(v: unknown): string {
  if (v == null) return "unknown";
  if (typeof v === "string") {
    if (v.length >= 7) return v.slice(0, 7); // "YYYY-MM-01" or ISO
    const d = new Date(v);
    return isNaN(+d) ? String(v) : d.toISOString().slice(0, 7);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 7);
  const s = String(v);
  return s.length >= 7 ? s.slice(0, 7) : s;
}

const fmtJPY = (v: string | number) => {
  const n = typeof v === "string" ? Number(v) : v;
  const num = Number.isFinite(n as number) ? (n as number) : 0;
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(num);
};

async function fetchMonthlyKPI(limit = 200): Promise<DBRow[]> {
  const sql = `
    SELECT channel_code, fiscal_month, actual_amount_yen
    FROM kpi.kpi_sales_monthly_computed_v2
    ORDER BY fiscal_month DESC, channel_code ASC
    LIMIT $1
  `;
  const { rows } = await pool.query(sql, [limit]);
  return rows as DBRow[];
}

export default async function Page() {
  let data: DBRow[] = [];
  try {
    data = await fetchMonthlyKPI(200);
  } catch (e: any) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">売上KPI（月次・チャネル別）</h1>
        <pre className="mt-4 whitespace-pre-wrap text-xs p-3 rounded border bg-neutral-50">
{`fetch error: ${e?.message || e}`}
        </pre>
      </main>
    );
  }

  // "YYYY-MM" 文字列でグルーピング
  const map = new Map<string, DBRow[]>();
  for (const r of data) {
    const ym = toYYYYMM(r.fiscal_month);
    const arr = map.get(ym) || [];
    arr.push(r);
    map.set(ym, arr);
  }

  // 降順（新しい月→古い月）
  const months = Array.from(map.keys()).sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0
  );

  return (
    <main className="p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">売上KPI（月次・チャネル別）</h1>
        <p className="text-sm text-neutral-500">
          Source: <code>kpi.kpi_sales_monthly_computed_v2</code>
        </p>
      </header>

      {months.length === 0 ? (
        <div className="text-sm text-neutral-500">データがありません。</div>
      ) : (
        months.map((ym) => {
          const rows = map.get(ym)!;
          return (
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
                    {rows.map((r, i) => (
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
          );
        })
      )}
    </main>
  );
}
