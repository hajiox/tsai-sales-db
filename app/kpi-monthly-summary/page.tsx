import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RowAgg = {
  channel_code: string | null;
  ytd_amount: string | number | null;
  curr_amount: string | number | null;
  prev_amount: string | number | null;
};

// DB接続
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// フォーマッタ
const fmtJPY = (v: string | number | null | undefined) => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  const num = Number.isFinite(n as number) ? (n as number) : 0;
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(num);
};

const toNum = (v: string | number | null | undefined) =>
  typeof v === "string" ? Number(v) : (v ?? 0);

// 会計年度（8月開始）レンジ & 今月/前月
function rangesUTC() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11
  const currMonthStart = new Date(Date.UTC(y, m, 1));
  const nextMonthStart = new Date(Date.UTC(y, m + 1, 1));
  const prevMonthStart = new Date(Date.UTC(y, m - 1, 1));

  const fyStartYear = (m + 1) >= 8 ? y : y - 1; // 8月始まり
  const fyStart = new Date(Date.UTC(fyStartYear, 7, 1)); // 8月
  // YTDは「今月の月初～来月月初」までを上限にして未来月を除外
  return {
    fyStartISO: fyStart.toISOString().slice(0, 10),
    currISO: currMonthStart.toISOString().slice(0, 10),
    prevISO: prevMonthStart.toISOString().slice(0, 10),
    nextISO: nextMonthStart.toISOString().slice(0, 10),
    fyLabel: `FY${fyStartYear + 1 - 2000}`, // 例: FY26
    currLabel: currMonthStart.toISOString().slice(0, 7),
    prevLabel: prevMonthStart.toISOString().slice(0, 7),
  };
}

// チャネル表示順（必要に応じて編集可／既存DB変更なし）
const CHANNEL_ORDER = ["WEB", "WHOLESALE", "STORE", "SHOKU"];
const channelRank = (c: string) => {
  const i = CHANNEL_ORDER.indexOf(c);
  return i === -1 ? 999 : i;
};

// 集計（0円はそもそも除外）
async function fetchAgg(): Promise<{ rows: RowAgg[]; meta: ReturnType<typeof rangesUTC> }> {
  const r = rangesUTC();
  const sql = `
    SELECT
      channel_code,
      SUM(actual_amount_yen) FILTER (WHERE fiscal_month >= $1 AND fiscal_month < $4) AS ytd_amount,
      SUM(actual_amount_yen) FILTER (WHERE fiscal_month >= $2 AND fiscal_month < $4) AS curr_amount,
      SUM(actual_amount_yen) FILTER (WHERE fiscal_month >= $3 AND fiscal_month < $2) AS prev_amount
    FROM kpi.kpi_sales_monthly_computed_v2
    WHERE COALESCE(actual_amount_yen, 0) <> 0
    GROUP BY channel_code
  `;
  const { rows } = await pool.query<RowAgg>(sql, [
    r.fyStartISO, // $1 YTD start
    r.currISO,    // $2 Curr month start
    r.prevISO,    // $3 Prev month start
    r.nextISO,    // $4 Next month start  ※未来月除外の上限
  ]);
  return { rows, meta: r };
}

export default async function Page() {
  let rows: RowAgg[] = [];
  let meta: ReturnType<typeof rangesUTC>;
  try {
    const res = await fetchAgg();
    rows = res.rows;
    meta = res.meta;
  } catch (e: any) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">売上KPIサマリ（当期）</h1>
        <pre className="mt-4 whitespace-pre-wrap text-xs p-3 rounded border bg-neutral-50">
{`fetch error: ${e?.message || e}`}
        </pre>
      </main>
    );
  }

  // 並び順（指定順 → アルファベット）
  const channels = rows
    .slice()
    .sort((a, b) => {
      const ac = String(a.channel_code ?? "");
      const bc = String(b.channel_code ?? "");
      const r = channelRank(ac) - channelRank(bc);
      return r !== 0 ? r : ac.localeCompare(bc);
    });

  // 合計
  const total = channels.reduce(
    (acc, r) => {
      acc.ytd += toNum(r.ytd_amount);
      acc.curr += toNum(r.curr_amount);
      acc.prev += toNum(r.prev_amount);
      return acc;
    },
    { ytd: 0, curr: 0, prev: 0 }
  );

  const diffAbs = total.curr - total.prev;
  const diffPct = total.prev === 0 ? null : (diffAbs / total.prev) * 100;

  return (
    <main className="p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">売上KPIサマリ（{meta.fyLabel} 当期）</h1>
        <p className="text-sm text-neutral-500">
          Source: <code>kpi.kpi_sales_monthly_computed_v2</code>（0円除外、未来月除外）
        </p>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-neutral-500">今月（{meta.currLabel}）</div>
          <div className="text-2xl font-semibold">{fmtJPY(total.curr)}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-neutral-500">前月（{meta.prevLabel}）</div>
          <div className="text-2xl font-semibold">{fmtJPY(total.prev)}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-neutral-500">YTD（{meta.fyLabel}）</div>
          <div className="text-2xl font-semibold">{fmtJPY(total.ytd)}</div>
          <div className="text-xs text-neutral-500 mt-1">
            MoM: {fmtJPY(diffAbs)}{diffPct === null ? "（—）" : `（${diffPct.toFixed(1)}%）`}
          </div>
        </div>
      </section>

      {/* Breakdown by Channel */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium">チャネル別内訳</h2>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-neutral-50">
              <tr className="text-left">
                <th className="px-4 py-2 w-[180px]">channel_code</th>
                <th className="px-4 py-2 text-right">前月（{meta.prevLabel}）</th>
                <th className="px-4 py-2 text-right">今月（{meta.currLabel}）</th>
                <th className="px-4 py-2 text-right">増減（MoM）</th>
                <th className="px-4 py-2 text-right">増減率</th>
                <th className="px-4 py-2 text-right">YTD（{meta.fyLabel}）</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((r, i) => {
                const prev = toNum(r.prev_amount);
                const curr = toNum(r.curr_amount);
                const ytd = toNum(r.ytd_amount);
                const d = curr - prev;
                const p = prev === 0 ? null : (d / prev) * 100;
                return (
                  <tr key={`${r.channel_code}-${i}`} className="border-t">
                    <td className="px-4 py-2 font-medium">{r.channel_code}</td>
                    <td className="px-4 py-2 text-right">{fmtJPY(prev)}</td>
                    <td className="px-4 py-2 text-right">{fmtJPY(curr)}</td>
                    <td className="px-4 py-2 text-right">{fmtJPY(d)}</td>
                    <td className="px-4 py-2 text-right">{p === null ? "—" : `${p.toFixed(1)}%`}</td>
                    <td className="px-4 py-2 text-right">{fmtJPY(ytd)}</td>
                  </tr>
                );
              })}
              <tr className="border-t bg-neutral-50 font-semibold">
                <td className="px-4 py-2">TOTAL</td>
                <td className="px-4 py-2 text-right">{fmtJPY(total.prev)}</td>
                <td className="px-4 py-2 text-right">{fmtJPY(total.curr)}</td>
                <td className="px-4 py-2 text-right">{fmtJPY(diffAbs)}</td>
                <td className="px-4 py-2 text-right">
                  {diffPct === null ? "—" : `${diffPct.toFixed(1)}%`}
                </td>
                <td className="px-4 py-2 text-right">{fmtJPY(total.ytd)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
