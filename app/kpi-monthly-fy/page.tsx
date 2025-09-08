import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DBRow = {
  channel_code: string;
  fiscal_month: any; // Date|string|null
  actual_amount_yen: string | number | null;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// FY=8月開始〜翌7月（UTCで安全に計算）
function fyRangeToday() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  const fyStartYear = m >= 8 ? y : y - 1;
  const start = new Date(Date.UTC(fyStartYear, 7, 1)); // 8月=7
  const end = new Date(Date.UTC(fyStartYear + 1, 7, 1)); // 翌年8月1日(排他)
  return {
    startISO: start.toISOString().slice(0, 10), // YYYY-MM-DD
    endISO: end.toISOString().slice(0, 10),
    label: `FY${fyStartYear + 1 - 2000}`, // 例: FY26
  };
}

function toYYYYMM(v: unknown): string {
  if (v == null) return "unknown";
  if (typeof v === "string") {
    if (v.length >= 7) return v.slice(0, 7);
    const d = new Date(v);
    return isNaN(+d) ? String(v) : d.toISOString().slice(0, 7);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 7);
  const s = String(v);
  return s.length >= 7 ? s.slice(0, 7) : s;
}

const fmtJPY = (v: string | number | null | undefined) => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  const num = Number.isFinite(n as number) ? (n as number) : 0;
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(num);
};

// 当期のみ & 0円除外 & 未来月除外
async function fetchFY(): Promise<DBRow[]> {
  const { startISO, endISO } = fyRangeToday();
  const sql = `
    SELECT channel_code, fiscal_month, actual_amount_yen
    FROM kpi.kpi_sales_monthly_computed_v2
    WHERE fiscal_month >= $1
      AND fiscal_month <  $2
      AND COALESCE(actual_amount_yen, 0) <> 0
    ORDER BY fiscal_month DESC, channel_code ASC
  `;
  const { rows } = await pool.query(sql, [startISO, endISO]);
  return rows as DBRow[];
}

// 表示順（必要ならお好みで調整）
const CHANNEL_ORDER = ["WEB", "WHOLESALE", "STORE", "SHOKU"];
const channelRank = (c: string) => {
  const i = CHANNEL_ORDER.indexOf(c);
  return i === -1 ? 999 : i;
};

export default async function Page() {
  let data: DBRow[] = [];
  try {
    data = await fetchFY();
  } catch (e: any) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">売上KPI（当期・月次）</h1>
        <pre className="mt-4 whitespace-pre-wrap text-xs p-3 rounded border bg-neutral-50">
{`fetch error: ${e?.message || e}`}
        </pre>
      </main>
    );
  }

  // 月ごとにグルーピング & 月小計
  const map = new Map<string, DBRow[]>();
  for (const r of data) {
    const ym = toYYYYMM(r.fiscal_month);
    const arr = map.get(ym) || [];
    arr.push(r);
    map.set(ym, arr);
  }

  const months = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const { label } = fyRangeToday();

  return (
    <main className="p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">売上KPI（{label} 当期・月次・チャネル別）</h1>
        <p className="text-sm text-neutral-500">
          Source: <code>kpi.kpi_sales_monthly_computed_v2</code>（当期のみ、0円除外、未来月除外）
        </p>
      </header>

      {months.length === 0 ? (
        <div className="text-sm text-neutral-500">当期のデータがありません。</div>
      ) : (
        months.map((ym) => {
          const rows = (map.get(ym) || []).slice().sort((a, b) => {
            const ac = String(a.channel_code ?? "");
            const bc = String(b.channel_code ?? "");
            const r = channelRank(ac) - channelRank(bc);
            return r !== 0 ? r : ac.localeCompare(bc);
          });

          const monthTotal = rows.reduce((s, r) => {
            const n = typeof r.actual_amount_yen === "string"
              ? Number(r.actual_amount_yen)
              : (r.actual_amount_yen ?? 0);
            return s + (Number.isFinite(n) ? n : 0);
          }, 0);

          return (
            <section key={ym} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">{ym}</h2>
                <div className="text-sm font-medium">小計: {fmtJPY(monthTotal)}</div>
              </div>
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
                        <td className="px-4 py-2 text-right">{fmtJPY(r.actual_amount_yen)}</td>
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
