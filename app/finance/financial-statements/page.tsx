// app/finance/financial-statements/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

type BSTotalRow = { side: "assets" | "liabilities" | "equity"; total: number };
type BSSnapshotRow = {
  section: string; // 資産 / 負債 / 純資産
  account_code: string;
  account_name: string;
  amount: number; // 符号付き
};

type PLRow = Record<string, any>; // gl_monthly_stats の1行（柔軟に受ける）

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function callRpc<T>(fn: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RPC ${fn} failed: ${res.status} ${res.statusText} ${body}`);
  }
  return (await res.json()) as T;
}

async function getFromTable<T = any>(path: string): Promise<T | null> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json;
}

function yen(n: number | null | undefined) {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(v);
}

function SectionCard(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white shadow p-6">
      <h2 className="text-lg font-semibold mb-4">{props.title}</h2>
      {props.children}
    </section>
  );
}

function Line({ name, value }: { name: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-slate-600">{name}</span>
      <span className="tabular-nums">{yen(value)}</span>
    </div>
  );
}

/** P/L のキー候補を柔軟に吸収 */
const pick = (obj: any, keys: string[]) => {
  for (const k of keys) if (k in obj && typeof obj[k] === "number") return obj[k];
  return undefined;
};

function FinancialStatementsInner() {
  const sp = useSearchParams();

  const monthParam = useMemo(() => {
    const q = sp.get("month");
    if (q && /^\d{4}-\d{2}$/.test(q)) return q;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, [sp]);

  const pMonth = useMemo(() => `${monthParam}-01`, [monthParam]);

  const [bsTotals, setBsTotals] = useState<BSTotalRow[] | null>(null);
  const [bsRows, setBsRows] = useState<BSSnapshotRow[] | null>(null);
  const [netIncomeYtd, setNetIncomeYtd] = useState<number | null>(null);
  const [plRow, setPlRow] = useState<PLRow | null>(null);
  const [tab, setTab] = useState<"bs" | "pl">("bs");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const [t, s, ni] = await Promise.all([
          callRpc<BSTotalRow[]>("bs_totals_signed_v1", { p_month: pMonth }),
          callRpc<BSSnapshotRow[]>("bs_snapshot_clean", { p_month: pMonth }),
          callRpc<number>("calc_net_income_ytd", { p_month: pMonth }).catch(() => 0),
        ]);
        if (!cancelled) {
          setBsTotals(t);
          setBsRows(s);
          setNetIncomeYtd(typeof ni === "number" ? ni : 0);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Unknown error");
      }

      // P/L: gl_monthly_stats があれば使う（無ければ null）
      try {
        const rows = await getFromTable<any[]>(
          `gl_monthly_stats?report_month=eq.${pMonth}&select=*&limit=1`
        );
        if (!cancelled) setPlRow(rows?.[0] ?? null);
      } catch {
        if (!cancelled) setPlRow(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pMonth]);

  const a = bsTotals?.find((r) => r.side === "assets")?.total ?? 0;
  const l = bsTotals?.find((r) => r.side === "liabilities")?.total ?? 0;
  const e = bsTotals?.find((r) => r.side === "equity")?.total ?? 0;
  const gap = a - (l + e);

  const bySection = useMemo(() => {
    const rows = bsRows ?? [];
    const is = (label: string, s: string) => s.includes(label);
    return {
      assets: rows.filter((r) => is("資産", r.section)),
      liabilities: rows.filter((r) => is("負債", r.section)),
      equity: rows.filter((r) => is("純資産", r.section)),
    };
  }, [bsRows]);

  /** P/L整形：gl_monthly_stats が無ければ計算補完（粗いが見た目はP/L形式） */
  const pl = useMemo(() => {
    if (!plRow) {
      // 補完：売上=0, 原価=0, 販管費=0 として 当期純利益(YTD)のみ表示
      return {
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        sga: 0,
        operatingIncome: 0,
        nonOpInc: 0,
        nonOpExp: 0,
        ordinaryIncome: 0,
        extraGain: 0,
        extraLoss: 0,
        incomeBeforeTax: 0,
        corporateTax: 0,
        netIncome: Math.abs(netIncomeYtd ?? 0), // 純利益はRPCから
        note: "※gl_monthly_statsが見つからないため純利益のみ表示",
      };
    }
    // キー候補を吸収
    const revenue =
      pick(plRow, ["sales", "revenue", "net_sales", "売上高"]) ?? 0;
    const cogs =
      pick(plRow, ["cogs", "cost_of_sales", "売上原価"]) ?? 0;
    const sga =
      pick(plRow, ["sga", "selling_general_admin", "販管費", "販売費及び一般管理費"]) ??
      0;
    const nonOpInc =
      pick(plRow, ["non_operating_income", "営業外収益"]) ?? 0;
    const nonOpExp =
      pick(plRow, ["non_operating_expenses", "営業外費用"]) ?? 0;
    const extraGain =
      pick(plRow, ["extraordinary_income", "特別利益"]) ?? 0;
    const extraLoss =
      pick(plRow, ["extraordinary_loss", "特別損失"]) ?? 0;
    const corporateTax =
      pick(plRow, ["corporate_tax", "法人税等"]) ?? 0;
    const netIncome =
      pick(plRow, ["net_income", "当期純利益"]) ??
      Math.abs(netIncomeYtd ?? 0);

    const grossProfit =
      pick(plRow, ["gross_profit", "売上総利益"]) ?? revenue - cogs;
    const operatingIncome =
      pick(plRow, ["operating_income", "営業利益"]) ??
      grossProfit - sga;
    const ordinaryIncome =
      pick(plRow, ["ordinary_income", "経常利益"]) ??
      operatingIncome + nonOpInc - nonOpExp;
    const incomeBeforeTax =
      pick(plRow, ["income_before_tax", "税引前当期純利益"]) ??
      ordinaryIncome + extraGain - extraLoss;

    return {
      revenue,
      cogs,
      grossProfit,
      sga,
      operatingIncome,
      nonOpInc,
      nonOpExp,
      ordinaryIncome,
      extraGain,
      extraLoss,
      incomeBeforeTax,
      corporateTax,
      netIncome: Math.abs(netIncome), // 表示は正数
      note: "",
    };
  }, [plRow, netIncomeYtd]);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-bold mb-4">財務諸表</h1>

        {/* タブ切り替え */}
        <div className="mb-4 inline-flex rounded-xl bg-white shadow p-1">
          <button
            onClick={() => setTab("bs")}
            className={`px-4 py-2 rounded-lg text-sm ${
              tab === "bs" ? "bg-slate-900 text-white" : "text-slate-700"
            }`}
          >
            貸借対照表（B/S）
          </button>
          <button
            onClick={() => setTab("pl")}
            className={`px-4 py-2 rounded-lg text-sm ${
              tab === "pl" ? "bg-slate-900 text-white" : "text-slate-700"
            }`}
          >
            損益計算書（P/L）
          </button>
        </div>

        {tab === "bs" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 資産 */}
            <SectionCard title="資産の部">
              <div className="divide-y">
                {bySection.assets.map((r) => (
                  <Line
                    key={r.account_code}
                    name={r.account_name}
                    value={Math.abs(r.amount)}
                  />
                ))}
              </div>
              <div className="border-t mt-3 pt-2 flex items-baseline justify-between">
                <span className="font-semibold">資産合計</span>
                <span className="font-semibold">{yen(a)}</span>
              </div>
            </SectionCard>

            {/* 負債・純資産 */}
            <SectionCard title="負債・純資産の部">
              <div className="mb-3">
                <div className="text-sm text-slate-500 mb-1">負債</div>
                <div className="divide-y">
                  {bySection.liabilities.map((r) => (
                    <Line
                      key={r.account_code}
                      name={r.account_name}
                      value={Math.abs(r.amount)}
                    />
                  ))}
                </div>
                <div className="border-t mt-3 pt-2 flex items-baseline justify-between">
                  <span className="font-medium">負債合計</span>
                  <span className="font-medium">{yen(l)}</span>
                </div>
              </div>

              <div>
                <div className="text-sm text-slate-500 mb-1">純資産</div>
                <div className="divide-y">
                  {bySection.equity.map((r) => (
                    <Line
                      key={r.account_code}
                      name={r.account_name}
                      value={Math.abs(r.amount)}
                    />
                  ))}
                </div>
                <div className="border-t mt-3 pt-2 flex items-baseline justify-between">
                  <span className="font-medium">純資産合計（表示は絶対値）</span>
                  <span className="font-medium">{yen(Math.abs(e))}</span>
                </div>
              </div>

              <div className="text-sm mt-3">
                {gap === 0 ? (
                  <span className="text-emerald-600">検算一致：差額 ¥0</span>
                ) : (
                  <span className="text-rose-600">検算不一致：差額 {yen(gap)}</span>
                )}
              </div>
            </SectionCard>
          </div>
        ) : (
          // P/L
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SectionCard title="損益計算書（当期累計）">
              <div className="divide-y">
                <Line name="売上高" value={pl.revenue} />
                <Line name="売上原価" value={pl.cogs} />
                <div className="py-1" />
                <Line name="売上総利益（粗利）" value={pl.grossProfit} />
                <Line name="販売費及び一般管理費" value={pl.sga} />
                <div className="py-1" />
                <Line name="営業利益" value={pl.operatingIncome} />
                <Line name="営業外収益" value={pl.nonOpInc} />
                <Line name="営業外費用" value={pl.nonOpExp} />
                <div className="py-1" />
                <Line name="経常利益" value={pl.ordinaryIncome} />
                <Line name="特別利益" value={pl.extraGain} />
                <Line name="特別損失" value={pl.extraLoss} />
                <div className="py-1" />
                <Line name="税引前当期純利益" value={pl.incomeBeforeTax} />
                <Line name="法人税等" value={pl.corporateTax} />
                <div className="border-t mt-3 pt-2 flex items-baseline justify-between">
                  <span className="font-semibold">当期純利益</span>
                  <span className="font-semibold">{yen(pl.netIncome)}</span>
                </div>
              </div>
              {pl.note && (
                <div className="text-xs text-slate-500 mt-2">{pl.note}</div>
              )}
            </SectionCard>

            <SectionCard title="対象月 / 取得情報">
              <div className="text-sm text-slate-600 space-y-1">
                <div>対象月: {monthParam}（送信 p_month: {pMonth}）</div>
                <div>純利益（RPC YTD）: {yen(Math.abs(netIncomeYtd ?? 0))}</div>
                {error && <div className="text-rose-600">Error: {error}</div>}
                {!plRow && (
                  <div className="text-amber-600">
                    gl_monthly_stats が見つからないため、主要小計は計算で補完しています。
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<main className="p-8 text-slate-500">読み込み中…</main>}>
      <FinancialStatementsInner />
    </Suspense>
  );
}
