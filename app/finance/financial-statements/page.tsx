// app/finance/financial-statements/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

type BSTotalRow = { side: "assets" | "liabilities" | "equity"; total: number };
type BSSnapshotRow = {
  section: string; // "資産" | "負債" | "純資産"
  account_code: string;
  account_name: string;
  amount: number; // 符号付き
};
type AccountMaster = { account_code: string; account_type: string };
type MabRow = { account_code: string; closing_balance: number };

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
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RPC ${fn} failed: ${res.status} ${res.statusText} ${body}`);
  }
  return (await res.json()) as T;
}

async function fromTable<T>(path: string): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET /${path} failed: ${res.status} ${res.statusText} ${body}`);
  }
  return (await res.json()) as T;
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

/** P/Lのキー候補を柔軟に吸収（gl_monthly_stats を使う場合の保険） */
const pick = (obj: any, keys: string[]) => {
  for (const k of keys) if (k in obj && typeof obj[k] === "number") return obj[k];
  return undefined;
};

function FinancialStatementsInner() {
  const sp = useSearchParams();

  // URL ?month=YYYY-MM（無ければ当月）
  const monthParam = useMemo(() => {
    const q = sp.get("month");
    if (q && /^\d{4}-\d{2}$/.test(q)) return q;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, [sp]);
  // RPCへは 'YYYY-MM-01' の文字列（Date化しない）
  const pMonth = useMemo(() => `${monthParam}-01`, [monthParam]);

  const [bsTotals, setBsTotals] = useState<BSTotalRow[] | null>(null);
  const [bsRows, setBsRows] = useState<BSSnapshotRow[] | null>(null);
  const [netIncomeYtd, setNetIncomeYtd] = useState<number | null>(null);

  // PL用：収益/費用の集計（monthly_account_balance + account_master）
  const [plCalc, setPlCalc] = useState<{
    revenue: number;
    expense: number;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"bs" | "pl">("bs");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        // B/S & 純利益
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

        // P/L：account_master で「収益/費用」分類し、monthly_account_balance で当期累計を集計
        // 1) すべての科目コードとタイプを取得（必要列のみ）
        const am = await fromTable<AccountMaster[]>(
          "account_master?select=account_code,account_type"
        );
        const typeMap = new Map(am.map((r) => [r.account_code, r.account_type]));

        // 2) 対象月の残高（当期累計）を取得
        const mab = await fromTable<MabRow[]>(
          `monthly_account_balance?select=account_code,closing_balance&report_month=eq.${pMonth}`
        );

        // 3) 収益/費用で集計（符号はDBのまま、表示は絶対値にする）
        let revenueSigned = 0;
        let expenseSigned = 0;
        for (const row of mab) {
          const t = typeMap.get(row.account_code);
          if (t === "収益") revenueSigned += row.closing_balance ?? 0;
          else if (t === "費用") expenseSigned += row.closing_balance ?? 0;
        }
        if (!cancelled) {
          setPlCalc({
            revenue: Math.abs(revenueSigned),
            expense: Math.abs(expenseSigned),
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Unknown error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pMonth]);

  // ====== B/S ======
  const a = bsTotals?.find((r) => r.side === "assets")?.total ?? 0;
  const l = bsTotals?.find((r) => r.side === "liabilities")?.total ?? 0;
  const e = bsTotals?.find((r) => r.side === "equity")?.total ?? 0; // 符号付き
  const leTotal = l + e;
  const gap = a - leTotal;

  // 明細：厳密分類（"資産" に "純資産" を含めない）
  const bySection = useMemo(() => {
    const rows = bsRows ?? [];
    const norm = (s: string) => s.replace(/\s/g, "");
    return {
      assets: rows.filter((r) => {
        const s = norm(r.section);
        return s === "資産" || s.startsWith("資産の部");
      }),
      liabilities: rows.filter((r) => {
        const s = norm(r.section);
        return s === "負債" || s.startsWith("負債の部");
      }),
      equity: rows.filter((r) => {
        const s = norm(r.section);
        return s === "純資産" || s.startsWith("純資産の部");
      }),
    };
  }, [bsRows]);

  // ====== P/L（収益・費用から作る簡易版）======
  const revenue = plCalc?.revenue ?? 0;
  const expense = plCalc?.expense ?? 0;
  const grossProfit = revenue - expense; // 純粋な粗利扱い（原価/販管費の内訳は不明のため総額で計上）
  const operatingIncome = grossProfit; // 内訳がないので=粗利
  const ordinaryIncome = operatingIncome; // 同上
  const incomeBeforeTax = ordinaryIncome; // 同上
  const corporateTax = 0; // 不明のため0
  const netIncomeAbs = Math.abs(netIncomeYtd ?? 0);

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
                  <Line key={r.account_code} name={r.account_name} value={Math.abs(r.amount)} />
                ))}
              </div>
              <div className="border-t mt-3 pt-2 flex items-baseline justify-between">
                <span className="font-semibold">資産合計</span>
                <span className="font-semibold">{yen(a)}</span>
              </div>
            </SectionCard>

            {/* 負債・純資産 */}
            <SectionCard title="負債・純資産の部">
              {/* 負債 */}
              <div className="mb-3">
                <div className="text-sm text-slate-500 mb-1">負債</div>
                <div className="divide-y">
                  {bySection.liabilities.map((r) => (
                    <Line key={r.account_code} name={r.account_name} value={Math.abs(r.amount)} />
                  ))}
                </div>
                <div className="border-t mt-3 pt-2 flex items-baseline justify-between">
                  <span className="font-medium">負債合計</span>
                  <span className="font-medium">{yen(l)}</span>
                </div>
              </div>

              {/* 純資産 */}
              <div>
                <div className="text-sm text-slate-500 mb-1">純資産</div>
                <div className="divide-y">
                  {bySection.equity.map((r) => (
                    <Line key={r.account_code} name={r.account_name} value={Math.abs(r.amount)} />
                  ))}
                </div>
                <div className="border-t mt-3 pt-2 flex items-baseline justify-between">
                  <span className="font-medium">純資産合計（表示は絶対値）</span>
                  <span className="font-medium">{yen(Math.abs(e))}</span>
                </div>
              </div>

              {/* 末尾：負債・純資産合計 と 資産合計の一致表示 */}
              <div className="border-t mt-4 pt-3 flex items-baseline justify-between">
                <span className="font-semibold">負債・純資産合計</span>
                <span className="font-semibold">{yen(leTotal)}</span>
              </div>
              <div className="text-sm mt-2">
                {gap === 0 ? (
                  <span className="text-emerald-600">検算一致：資産合計 = 負債・純資産合計</span>
                ) : (
                  <span className="text-rose-600">検算不一致：差額 {yen(gap)}</span>
                )}
              </div>
            </SectionCard>
          </div>
        ) : (
          // ===== P/L =====
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SectionCard title="損益計算書（当期累計）">
              <div className="divide-y">
                <Line name="売上高（収益）" value={revenue} />
                <Line name="費用合計" value={expense} />
                <div className="py-1" />
                <Line name="売上総利益（粗利相当）" value={grossProfit} />
                <Line name="営業利益（簡易）" value={operatingIncome} />
                <div className="py-1" />
                <Line name="経常利益（簡易）" value={ordinaryIncome} />
                <Line name="税引前当期純利益（簡易）" value={incomeBeforeTax} />
                <Line name="法人税等（表示のみ）" value={corporateTax} />
                <div className="border-t mt-3 pt-2 flex items-baseline justify-between">
                  <span className="font-semibold">当期純利益（RPC YTD）</span>
                  <span className="font-semibold">{yen(netIncomeAbs)}</span>
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                ※ 原価/販管費などの内訳が取得できないため、{" "}
                <span className="font-medium">収益・費用の集計から簡易P/Lを作成</span>
                しています。
              </div>
            </SectionCard>

            <SectionCard title="対象月 / 取得情報">
              <div className="text-sm text-slate-600 space-y-1">
                <div>対象月: {monthParam}（送信 p_month: {pMonth}）</div>
                <div>収益集計: {yen(revenue)} / 費用集計: {yen(expense)}</div>
                <div>純利益（RPC YTD）: {yen(netIncomeAbs)}</div>
                {error && <div className="text-rose-600">Error: {error}</div>}
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
