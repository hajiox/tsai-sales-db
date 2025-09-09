// DB直叩きで final_v1 vs computed_v2 の月次差分を描画
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const JPY = (n: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(n || 0);

const CHS = ["WEB", "WHOLESALE", "STORE", "SHOKU", "OTHER"] as const;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// 会計年度=8月開始
function fyNow() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const fyStartYear = m >= 8 ? y : y - 1;
  const start = new Date(Date.UTC(fyStartYear, 7, 1));
  const end = new Date(Date.UTC(fyStartYear + 1, 7, 1));
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)
    );
    months.push(d.toISOString().slice(0, 10));
  }
  return {
    fyLabel: `FY${fyStartYear + 1 - 2000}`,
    startISO: start.toISOString().slice(0, 10),
    endISO: end.toISOString().slice(0, 10),
    monthsYM: months.map((s) => s.slice(0, 7)),
  };
}

const ym = (s: string) => s.slice(0, 7);
const toNum = (v: any) => (typeof v === "string" ? Number(v) : v ?? 0);
const CANON = new Set(["WEB", "WHOLESALE", "STORE", "SHOKU"]);
function klass(norm: string) {
  const n = (norm || "").toUpperCase().trim();
  return CANON.has(n) ? (n as (typeof CHS)[number]) : "OTHER";
}

async function queryPivot(table: string, startISO: string, endISO: string) {
  const sql = `
    select
      date_trunc('month', fiscal_month)::date as m,
      upper(btrim(channel_code)) as norm_channel,
      sum(actual_amount_yen) as amt
    from ${table}
    where fiscal_month >= $1 and fiscal_month < $2
    group by 1,2
    order by 1,2
  `;
  const { rows } = await pool.query(sql, [startISO, endISO]);

  // month x channel のピボット
  const p: Record<string, Record<string, number>> = {};
  for (const r of rows as any[]) {
    const m = ym(r.m.toISOString().slice(0, 10));
    const ch = klass(r.norm_channel);
    const amt = toNum(r.amt);
    (p[m] ||= {});
    p[m][ch] = (p[m][ch] ?? 0) + amt;
  }
  return p;
}

export default async function Page() {
  let data:
    | {
        ok: true;
        fyLabel: string;
        monthsYM: string[];
        delta: Record<string, Record<string, number>>;
      }
    | { ok: false; error: string };

  try {
    const { fyLabel, startISO, endISO, monthsYM } = fyNow();

    // final と computed を並列取得
    const [pf, pc] = await Promise.all([
      queryPivot("kpi.kpi_sales_monthly_final_v1", startISO, endISO),
      queryPivot("kpi.kpi_sales_monthly_computed_v2", startISO, endISO),
    ]);

    // delta = final - computed
    const delta: Record<string, Record<string, number>> = {};
    for (const m of monthsYM) {
      const row: Record<string, number> = {};
      for (const ch of CHS) {
        const v = (pf[m]?.[ch] ?? 0) - (pc[m]?.[ch] ?? 0);
        if (v !== 0) row[ch] = v;
      }
      const totF = Object.values(pf[m] || {}).reduce((s, n) => s + n, 0);
      const totC = Object.values(pc[m] || {}).reduce((s, n) => s + n, 0);
      const tot = totF - totC;
      if (tot !== 0) row["TOTAL"] = tot;
      delta[m] = row;
    }

    data = { ok: true, fyLabel, monthsYM, delta };
  } catch (e: any) {
    data = { ok: false, error: e?.message || String(e) };
  }

  if (!data.ok) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">final vs computed 差分</h1>
        <p className="text-sm text-red-600">DB実行時にエラーが発生しました。</p>
        <pre className="mt-4 text-xs whitespace-pre-wrap">
          {data.error}
        </pre>
      </main>
    );
  }

  const { fyLabel, monthsYM, delta } = data;

  return (
    <main className="p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          final_v1 vs computed_v2 差分（{fyLabel}）
        </h1>
        <p className="text-sm text-neutral-500">
          値は <code>final - computed</code>。≠0 のセルのみ強調表示。
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">月次差分</h2>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left w-[120px]">month</th>
                {CHS.map((c) => (
                  <th key={c} className="px-3 py-2 text-right">
                    {c}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {monthsYM.map((m) => {
                const row = delta[m] || {};
                const has = Object.keys(row).length > 0;
                if (!has) {
                  return (
                    <tr key={m} className="border-t">
                      <td className="px-3 py-2 font-medium">{m}</td>
                      {CHS.map((c) => (
                        <td key={`${m}-${c}`} className="px-3 py-2 text-right">
                          —
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">—</td>
                    </tr>
                  );
                }
                return (
                  <tr key={m} className="border-t">
                    <td className="px-3 py-2 font-medium">{m}</td>
                    {CHS.map((c) => {
                      const v = row[c as any] ?? 0;
                      const hit = v !== 0;
                      return (
                        <td
                          key={`${m}-${c}`}
                          className={`px-3 py-2 text-right ${
                            hit ? "font-semibold text-red-600" : ""
                          }`}
                        >
                          {hit ? JPY(v) : "—"}
                        </td>
                      );
                    })}
                    <td
                      className={`px-3 py-2 text-right ${
                        row["TOTAL"] ? "font-semibold text-red-600" : ""
                      }`}
                    >
                      {row["TOTAL"] ? JPY(row["TOTAL"]) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

