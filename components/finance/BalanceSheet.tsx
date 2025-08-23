// /components/finance/BalanceSheet.tsx ver.6 (2025-08-23 JST)
// 修正点：
// 1) 合計ロジックを会計準拠に変更
//    - 検算: signedA + signedL + signedE === 0
//    - 表示: creditTotal = ABS(signedL + signedE)
// 2) UIの一致判定も上記に合わせて修正

"use client";

import React from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// 通貨表記
const jpy = (v: number) => (v < 0 ? `▲¥${Math.abs(v).toLocaleString()}` : `¥${v.toLocaleString()}`);
// 型ゆるめ→数値正規化
const toNum = (v: any) =>
  typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : Number(v ?? 0) || 0;
// "2025-04" → "2025-04-01"
const normMonth = (m: string) => (m?.length === 7 ? `${m}-01` : m);

type BsRow = { side: "assets" | "liabilities" | "equity"; total: number };

async function fetchBsTotals(month?: string): Promise<BsRow[]> {
  const supabase =
    typeof window === "undefined"
      ? null
      : (await import("@/lib/supabase/browser")).getSupabaseBrowserClient();
  if (!supabase) return [];
  if (month) {
    const { data, error } = await supabase.rpc("bs_totals", { target_month: month });
    if (error) throw error;
    return data as BsRow[];
  } else {
    const { data, error } = await supabase.rpc("bs_totals");
    if (error) throw error;
    return data as BsRow[];
  }
}

function BalanceSheet({ month }: { month: string }) {
  const supabase = React.useMemo(
    () => (typeof window !== "undefined" ? getSupabaseBrowserClient() : null),
    []
  );

  const [lines, setLines] = React.useState<any[]>([]);

  // 表示用の正数
  const [A, setA] = React.useState(0);
  const [L, setL] = React.useState(0);
  const [E, setE] = React.useState(0);

  // 検算用の符号付き（資産＋、負債/純資産は−）
  const [signedA, setSignedA] = React.useState(0);
  const [signedL, setSignedL] = React.useState(0);
  const [signedE, setSignedE] = React.useState(0);

  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    const m = normMonth(month);
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 合計（符号付きで受け取り→表示用は絶対値に）
        const totals = await fetchBsTotals(month);
        const sA = toNum(totals.find((x) => x.side === "assets")?.total);       // + のはず
        const sL = toNum(totals.find((x) => x.side === "liabilities")?.total);  // − のはず
        const sE = toNum(totals.find((x) => x.side === "equity")?.total);       // − のはず

        const r = await supabase.rpc("bs_snapshot_clean", { p_month: m });
        if (r.error) throw r.error;
        const rows = (r.data ?? []).map((x: any) => ({ ...x, amount: toNum(x.amount) }));

        if (mounted) {
          setSignedA(sA);
          setSignedL(sL);
          setSignedE(sE);

          setA(Math.abs(sA));
          setL(Math.abs(sL));
          setE(Math.abs(sE));

          setLines(rows);
        }
      } catch (e: any) {
        if (mounted) setErr(e?.message ?? String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [month, supabase]);

  if (loading) return <div className="p-6 text-gray-500">loading…</div>;
  if (err) return <div className="p-4 text-red-700 bg-red-50 rounded">取得エラー：{String(err)}</div>;

  // 会計検算（0なら正しい）
  const okSigned = Math.round(signedA + signedL + signedE) === 0;

  // 画面表示用の右側合計：負債＋純資産（符号付きで合算→絶対値）
  const creditTotal = Math.abs(signedL + signedE);
  const okUI = Math.round(A) === Math.round(creditTotal);

  const assets = lines.filter((x) => x.section === "資産");
  const liabilities = lines.filter((x) => x.section === "負債");
  const equity = lines.filter((x) => x.section === "純資産");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">資産の部</h3>
        <ul className="divide-y">
          {assets.map((a) => (
            <li key={`${a.section}-${a.account_code}`} className="flex justify-between py-2">
              <span className="truncate pr-2">「{String(a.account_name)}」</span>
              <span className="tabular-nums">{jpy(a.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
          <span>資産合計</span>
          <span className="tabular-nums">{jpy(A)}</span>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">負債・純資産の部</h3>

        <div className="mb-1 text-sm text-gray-500">負債</div>
        <ul className="divide-y">
          {liabilities.map((l) => (
            <li key={`${l.section}-${l.account_code}`} className="flex justify-between py-2">
              <span className="truncate pr-2">「{String(l.account_name)}」</span>
              <span className="tabular-nums">{jpy(Math.abs(l.amount))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
          <span>負債合計</span>
          <span className="tabular-nums">{jpy(L)}</span>
        </div>

        <div className="mt-6 mb-1 text-sm text-gray-500">純資産</div>
        <ul className="divide-y">
          {equity.map((e) => (
            <li key={`${e.section}-${e.account_code}`} className="flex justify-between py-2">
              <span className="truncate pr-2">「{String(e.account_name)}」</span>
              <span className="tabular-nums">{jpy(Math.abs(e.amount))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
          <span>純資産計</span>
          <span className="tabular-nums">{jpy(E)}</span>
        </div>

        <div className="mt-4 flex justify-between border-t pt-3 font-semibold">
          <span>負債＋純資産合計</span>
          <span className="tabular-nums">{jpy(creditTotal)}</span>
        </div>

        {!okUI && (
          <p className="mt-2 text-sm text-red-600">※貸借不一致（資産≠負債＋純資産）。データ要確認</p>
        )}
        {!okSigned && (
          <p className="mt-1 text-xs text-orange-600">
            ※内部検算：資産＋負債＋純資産≠0（計上データを確認）
          </p>
        )}
      </section>
    </div>
  );
}

// ver.6 (2025-08-23 JST) - 正しい合計ロジック/検算ロジックに修正
export { BalanceSheet };
export default BalanceSheet;
