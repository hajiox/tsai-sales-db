// app/finance/financial-statements/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * 必須: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を .env に設定
 * ポイント:
 * - p_month は URL の ?month=YYYY-MM をそのまま使って `${month}-01` の「文字列」で渡す
 * - toISOString() などで Date にしない（年ズレ/タイムゾーンを避ける）
 */

type BSTotalRow = { side: "assets" | "liabilities" | "equity"; total: number };
type BSSnapshotRow = {
  section: string;
  account_code: string;
  account_name: string;
  amount: number;
};

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

function yen(n: number | null | undefined) {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(v);
}

export default function FinancialStatementsPage() {
  const sp = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totals, setTotals] = useState<BSTotalRow[] | null>(null);
  const [snapshot, setSnapshot] = useState<BSSnapshotRow[] | null>(null);

  // URL ?month=YYYY-MM（無ければ当月のYYYY-MM）
  const monthParam = useMemo(() => {
    const q = sp.get("month");
    if (q && /^\d{4}-\d{2}$/.test(q)) return q;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return ym;
  }, [sp]);

  // RPC へは 'YYYY-MM-01' の文字列で渡す（Date にしない）
  const pMonth = useMemo(() => `${monthParam}-01`, [monthParam]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [t, s] = await Promise.all([
          callRpc<BSTotalRow[]>("bs_totals_signed_v1", { p_month: pMonth }),
          callRpc<BSSnapshotRow[]>("bs_snapshot_clean", { p_month: pMonth }),
        ]);
        if (!cancelled) {
          setTotals(t);
          setSnapshot(s);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pMonth]);

  const a = totals?.find((r) => r.side === "assets")?.total ?? 0;
  const l = totals?.find((r) => r.side === "liabilities")?.total ?? 0;
  const e = totals?.find((r) => r.side === "equity")?.total ?? 0;
  const gap = a - (l + e);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-8">
        <h1 className="text-2xl font-bold mb-6">財務諸表</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 資産の部 */}
          <section className="rounded-2xl bg-white shadow p-6">
            <h2 className="text-lg font-semibold mb-4">資産の部</h2>
            <div className="flex items-baseline justify-between">
              <span className="text-slate-600">資産合計</span>
              <span className="text-xl font-semibold">{yen(a)}</span>
            </div>
          </section>

          {/* 負債・純資産の部 */}
          <section className="rounded-2xl bg-white shadow p-6">
            <h2 className="text-lg font-semibold mb-1">負債・純資産の部</h2>

            <div className="flex items-baseline justify-between py-2">
              <span className="text-slate-600">負債合計</span>
              <span className="text-xl font-semibold">{yen(l)}</span>
            </div>

            <div className="flex items-baseline justify-between py-1">
              <span className="text-slate-600">
                純資産 <span className="text-xs text-slate-400">（検算は符号付き）</span>
              </span>
              {/* 画面表示は絶対値。符号は totals の値（e）に保持 */}
              <span className="text-base font-medium">{yen(Math.abs(e))}</span>
            </div>

            <div className="text-sm mt-2">
              {gap === 0 ? (
                <span className="text-emerald-600">検算一致：差額 ¥0</span>
              ) : (
                <span className="text-rose-600">検算不一致：差額 {yen(gap)}</span>
              )}
            </div>
          </section>
        </div>

        {/* エラー/ローディング表示 */}
        <div className="mt-6 text-sm text-slate-500">
          <div>対象月: {monthParam}（送信 p_month: {pMonth}）</div>
          {loading && <div>読み込み中…</div>}
          {error && <div className="text-rose-600">Error: {error}</div>}
        </div>

        {/* （必要なら）明細を後でここに描画できます */}
        {/* snapshot は B/S明細（section, account_code, account_name, amount） */}
        {/* console.debug("snapshot", snapshot); */}
      </div>
    </main>
  );
}
