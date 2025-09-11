// app/finance/financial-statements/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

/* =========================
   Types
========================= */
type BSTotalRow = { side: "assets" | "liabilities" | "equity"; total: number };
type BSSnapshotRow = {
  section: string; // "資産" | "負債" | "純資産"
  account_code: string;
  account_name: string;
  amount: number; // 符号付き
};
type MabRow = { account_code: string; closing_balance: number };

/* =========================
   Supabase helpers
========================= */
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set"); })();

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

/* =========================
   UI helpers
========================= */
const yen = (n: number | null | undefined) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(
    typeof n === "number" ? n : 0
  );

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

/* =========================
   PDF準拠のP/Lマッピング
   （必要に応じてここへ追加）
========================= */
// 売上
const SALES = [
  { code: "810", label: "ＥＣ売上" },
  { code: "811", label: "外販・卸売上" },
  { code: "812", label: "会津食のブランド館売上" },
  { code: "813", label: "会津ブランド館売上高" },
];
const NET_SALES = { code: "9530", label: "純売上高" };

// 仕入・原価
const PURCHASES = [
  { code: "461", label: "ＥＣ・外販・卸仕入高" },
  { code: "462", label: "会津食のブランド館仕入高" },
  { code: "463", label: "会津ブランド館仕入高" },
];
const NET_PURCHASES = { code: "9550", label: "純仕入高" };
const COGS = { code: "9570", label: "売上原価" };
const GROSS_PROFIT = { code: "9580", label: "売上総利益" };

// 人件費
const PERSONNEL = [
  { code: "500", label: "役員報酬" },
  { code: "501", label: "給料手当" },
  { code: "504", label: "法定福利費" },
  { code: "505", label: "福利厚生費" },
  { code: "509", label: "雑給" },
];
const PERSONNEL_SUBTOTAL = { code: "9605", label: "人件費（小計）" };

// その他販管費
const SGA_DETAILS = [
  { code: "510", label: "広告宣伝費" },
  { code: "515", label: "衛生費" },
  { code: "520", label: "水道光熱費" },
  { code: "521", label: "車両関連費" },
  { code: "523", label: "消耗品費" },
  { code: "524", label: "賃借料" },
  { code: "525", label: "支払保険料" },
  { code: "526", label: "修繕費" },
  { code: "528", label: "減価償却費" },
  { code: "3023", label: "リース資産減価償却費" },
  { code: "529", label: "接待交際費" },
  { code: "530", label: "旅費交通費" },
  { code: "531", label: "通信費" },
  { code: "532", label: "支払手数料" },
  { code: "535", label: "寄付金" },
  { code: "1258", label: "支払報酬" },
  { code: "539", label: "雑費" },
];
const SGA_SUBTOTAL = { code: "9620", label: "一般管理費（小計）" };
const SGA_TOTAL = { code: "9630", label: "販売費及び一般管理費" };

// 営業・営業外～最終
const OPERATING_INCOME = { code: "9640", label: "営業利益" };
const NONOP_INCOME_DETAILS = [
  { code: "9645", label: "受取利息" },
  { code: "604", label: "雑収入" },
];
const NONOP_INCOME_SUBTOTAL = { code: "9660", label: "営業外収益（小計）" };
const NONOP_EXPENSE_DETAILS = [{ code: "610", label: "支払利息" }];
const NONOP_EXPENSE_SUBTOTAL = { code: "9680", label: "営業外費用（小計）" };
const ORDINARY_INCOME = { code: "9700", label: "経常利益" };
const PRETAX_INCOME = { code: "9730", label: "税引前当期純利益" };
const NET_INCOME = { code: "9750", label: "当期純利益" };

/* =========================
   Page component
========================= */
function FinancialStatementsInner() {
  const sp = useSearchParams();

  // ?month=YYYY-MM（無ければ当月）
  const monthParam = useMemo(() => {
    const q = sp.get("month");
    if (q && /^\d{4}-\d{2}$/.test(q)) return q;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, [sp]);

  // RPCへは 'YYYY-MM-01' 文字列
  const pMonth = useMemo(() => `${monthParam}-01`, [monthParam]);
  const pMonthPrev = useMemo(() => {
    const [y, m] = monthParam.split("-").map(Number);
    const d = new Date(y, m - 2, 1); // 前月1日
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, [monthParam]);

  const [bsTotals, setBsTotals] = useState<BSTotalRow[] | null>(null);
  const [bsRows, setBsRows] = useState<BSSnapshotRow[] | null>(null);
  const [netIncomeYtd, setNetIncomeYtd] = useState<number | null>(null);
  const [netIncomeYtdPrev, setNetIncomeYtdPrev] = useState<number | null>(null);
  const [mabMap, setMabMap] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"bs" | "pl">("bs");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        // B/S と 純利益（YTD/前月YTD）
        const [t, s, ni, niPrev] = await Promise.all([
          callRpc<BSTotalRow[]>("bs_totals_signed_v1", { p_month: pMonth }),
          callRpc<BSSnapshotRow[]>("bs_snapshot_clean", { p_month: pMonth }),
          callRpc<number>("calc_net_income_ytd", { p_month: pMonth }).catch(() => 0),
          callRpc<number>("calc_net_income_ytd", { p_month: pMonthPrev }).catch(() => 0),
        ]);
        if (!cancelled) {
          setBsTotals(t);
          setBsRows(s);
          setNetIncomeYtd(typeof ni === "number" ? ni : 0);
          setNetIncomeYtdPrev(typeof niPrev === "number" ? niPrev : 0);
        }

        // 対象月の勘定別残高（当期累計）
        const mab = await fromTable<MabRow[]>(
          `monthly_account_balance?select=account_code,closing_balance&report_month=eq.${pMonth}`
        );
        if (!cancelled) {
          const map: Record<string, number> = {};
          for (const r of mab) map[r.account_code] = r.closing_balance ?? 0;
          setMabMap(map);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Unknown error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pMonth, pMonthPrev]);

  /* ---------- B/S ---------- */
  const a = bsTotals?.find((r) => r.side === "assets")?.total ?? 0;
  const l = bsTotals?.find((r) => r.side === "liabilities")?.total ?? 0;
  const e = bsTotals?.find((r) => r.side === "equity")?.total ?? 0; // 符号付き
  const leTotal = l + e;
  const gap = a - leTotal;

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

  /* ---------- P/L（PDF準拠） ---------- */
  const amt = (code: string) => Math.abs(mabMap[code] ?? 0);
  const sum = (codes: string[]) => codes.reduce((s, c) => s + amt(c), 0);

  // 売上
  const salesRows = SALES.map((r) => ({ label: r.label, value: amt(r.code) }));
  const netSales = amt(NET_SALES.code) || sum(SALES.map((r) => r.code));

  // 仕入・原価
  const purchaseRows = PURCHASES.map((r) => ({ label: r.label, value: amt(r.code) }));
  const netPurchases = amt(NET_PURCHASES.code) || sum(PURCHASES.map((r) => r.code));
  const cogs = amt(COGS.code) || netPurchases;

  // 粗利
  const grossProfit = amt(GROSS_PROFIT.code) || Math.max(netSales - cogs, 0);

  // 販管費（人件費→その他）
  const personnelSubtotal = amt(PERSONNEL_SUBTOTAL.code) || sum(PERSONNEL.map((r) => r.code));
  const sgaSubtotal =
    amt(SGA_SUBTOTAL.code) || (personnelSubtotal + sum(SGA_DETAILS.map((r) => r.code)));
  const sgaTotal = amt(SGA_TOTAL.code) || sgaSubtotal;

  // 営業利益
  const opIncome = amt(OPERATING_INCOME.code) || Math.max(grossProfit - sgaTotal, 0);

  // 営業外
  const nonOpIncSub =
    amt(NONOP_INCOME_SUBTOTAL.code) || sum(NONOP_INCOME_DETAILS.map((r) => r.code));
  const nonOpExpSub =
    amt(NONOP_EXPENSE_SUBTOTAL.code) || sum(NONOP_EXPENSE_DETAILS.map((r) => r.code));

  // 経常～純利益
  const ordinary = amt(ORDINARY_INCOME.code) || Math.max(opIncome + nonOpIncSub - nonOpExpSub, 0);
  const pretax = amt(PRETAX_INCOME.code) || ordinary;

  // 純利益：RPC(YTD)を真値、コードは参考
  const netIncomeFromCode = amt(NET_INCOME.code);
  const netIncomeAbs = Math.abs(netIncomeYtd ?? 0); // 累計(YTD)
  const netIncomeMonthly = Math.abs((netIncomeYtd ?? 0) - (netIncomeYtdPrev ?? 0)); // 単月
  const niMismatch =
    !!netIncomeFromCode && Math.abs(netIncomeFromCode - netIncomeAbs) > 1000;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-bold mb-4">財務諸表</h1>

        {/* タブ */}
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
          /* ---------- BS ---------- */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            <SectionCard title="負債・純資産の部">
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
          /* ---------- PL（PDF準拠＋単月/累計） ---------- */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SectionCard title="損益計算書（当期累計）">
              {/* 売上 */}
              <div className="divide-y mb-2">
                {SALES.map((r) => (
                  <Line key={r.code} name={r.label} value={amt(r.code)} />
                ))}
                <Line name={NET_SALES.label} value={netSales} />
              </div>

              {/* 仕入・原価 */}
              <div className="divide-y mb-2">
                {PURCHASES.map((r) => (
                  <Line key={r.code} name={r.label} value={amt(r.code)} />
                ))}
                <Line name={NET_PURCHASES.label} value={netPurchases} />
                <Line name={COGS.label} value={cogs} />
              </div>

              {/* 粗利 */}
              <div className="divide-y mb-2">
                <Line name={GROSS_PROFIT.label} value={grossProfit} />
              </div>

              {/* 販売費及び一般管理費 */}
              <div className="divide-y mb-2">
                {PERSONNEL.map((r) => (
                  <Line key={r.code} name={r.label} value={amt(r.code)} />
                ))}
                <Line name={PERSONNEL_SUBTOTAL.label} value={personnelSubtotal} />
                {SGA_DETAILS.map((r) => (
                  <Line key={r.code} name={r.label} value={amt(r.code)} />
                ))}
                <Line name={SGA_SUBTOTAL.label} value={sgaSubtotal} />
                <Line name={SGA_TOTAL.label} value={sgaTotal} />
              </div>

              {/* 営業～最終 */}
              <div className="divide-y">
                <Line name={OPERATING_INCOME.label} value={opIncome} />
                {NONOP_INCOME_DETAILS.map((r) => (
                  <Line key={r.code} name={r.label} value={amt(r.code)} />
                ))}
                <Line name={NONOP_INCOME_SUBTOTAL.label} value={nonOpIncSub} />
                {NONOP_EXPENSE_DETAILS.map((r) => (
                  <Line key={r.code} name={r.label} value={amt(r.code)} />
                ))}
                <Line name={NONOP_EXPENSE_SUBTOTAL.label} value={nonOpExpSub} />
                <Line name={ORDINARY_INCOME.label} value={ordinary} />
                <Line name={PRETAX_INCOME.label} value={pretax} />

                {/* 純利益：単月＋累計（RPC） */}
                <div className="border-t mt-3 pt-2 flex items-baseline justify-between">
                  <span className="font-semibold">当月純利益（単月）</span>
                  <span className="font-semibold">{yen(netIncomeMonthly)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-600">当期純利益（累計/YTD）</span>
                  <span className="tabular-nums">{yen(netIncomeAbs)}</span>
                </div>
                {niMismatch && (
                  <div className="text-xs text-amber-600 mt-1">
                    ※ 試算表コード {NET_INCOME.code} の値 {yen(netIncomeFromCode!)} と差異あり。RPCの値を採用しています。
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500 mt-3">
                ※ 小計/合計コードが無い行は内訳合算で補完しています。
              </div>
            </SectionCard>

            <SectionCard title="対象月 / 取得情報">
              <div className="text-sm text-slate-600 space-y-1">
                <div>対象月: {monthParam}（送信 p_month: {pMonth}）</div>
                <div>純利益（単月）: {yen(netIncomeMonthly)}</div>
                <div>純利益（累計/YTD）: {yen(Math.abs(netIncomeYtd ?? 0))}</div>
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
