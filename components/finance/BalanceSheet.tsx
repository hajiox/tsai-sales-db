// /components/finance/BalanceSheet.tsx ver.7 (2025-08-22 JST)
// 変更点：
// - 合計の一致判定を「資産＋負債＋純資産＝0」で判定
// - 右側の「負債＋純資産合計」は 符号付きで合算→絶対値 に修正

"use client";

import React from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const jpy = (v: number) =>
  v < 0 ? `▲¥${Math.abs(v).toLocaleString()}` : `¥${v.toLocaleString()}`;
const toNum = (v: any) =>
  typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : Number(v ?? 0) || 0;
const normMonth = (m?: string) => (m && m.length === 7 ? `${m}-01` : m);

type BsTotalsRow = { assets?: number; liabilities?: number; equity?: number };
type BsLine = {
  section: "資産" | "負債" | "純資産";
  account_code: string;
  account_name: string;
  amount: number; // 符号付き（資産＋、負債/純資産－）
};

type Props = { month?: string };

export default function BalanceSheet({ month }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // 表示用の正数合計
  const [A, setA] = React.useState(0);
  const [L, setL] = React.useState(0);
  const [E, setE] = React.useState(0);
  const [creditTotal, setCreditTotal] = React.useState(0); // |負債＋純資産|（符号付き合算→絶対値）

  // 検算用の符号付き合計
  const [signedA, setSignedA] = React.useState(0);
  const [signedL, setSignedL] = React.useState(0);
  const [signedE, setSignedE] = React.useState(0);

  const [lines, setLines] = React.useState<BsLine[]>([]);

  const equal = Math.round(signedA + signedL + signedE) === 0;

  React.useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        const m = normMonth(month) ?? new Date().toISOString().slice(0, 10);
        const supabase = getSupabaseBrowserClient();

        // 合計（date版）
        const { data: totalsData, error: totalsErr } = await supabase.rpc("bs_totals", {
          p_month: m,
        });
        if (totalsErr) throw totalsErr;
        const totals: BsTotalsRow = (totalsData?.[0] ?? {}) as BsTotalsRow;

        const sA = toNum((totals as any).assets);
        const sL = toNum((totals as any).liabilities);
        const sE = toNum((totals as any).equity);

        setSignedA(sA);
        setSignedL(sL);
        setSignedE(sE);

        setA(Math.abs(sA));
        setL(Math.abs(sL));
        setE(Math.abs(sE));
        setCreditTotal(Math.abs(sL + sE)); // ←ここがUI合計

        // 明細
        const { data: snapData, error: snapErr } = await supabase.rpc("bs_snapshot_clean", {
          p_month: m,
        });
        if (snapErr) throw snapErr;
        const rows: BsLine[] = (snapData ?? []).map((x: any) => ({
          section: x.section,
          account_code: x.account_code,
          account_name: x.account_name,
          amount: toNum(x.amount),
        }));
        setLines(rows);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [month]);

  return (
    <div className="w-full">
      <div className="mb-3">
        <h2 className="text-xl font-semibold">貸借対照表（B/S）</h2>
        {month && <p className="text-sm text-gray-500">対象月: {month}</p>}
      </div>

      {loading && <p>読み込み中…</p>}
      {err && (
        <div className="text-red-600 text-sm border border-red-300 rounded p-2 mb-3">
          エラー: {err}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左：資産・内訳 */}
        <div className="rounded border p-4 bg-white">
          <h3 className="font-bold mb-2">資産の部</h3>
          <ul className="divide-y">
            {lines
              .filter((r) => r.section === "資産")
              .map((r) => (
                <li key={r.account_code} className="py-1 flex justify-between">
                  <span className="truncate">{`「${r.account_name}」`}</span>
                  <span>{jpy(r.amount)}</span>
                </li>
              ))}
          </ul>
          <div className="mt-3 text-right font-semibold">資産合計：{jpy(A)}</div>
        </div>

        {/* 右：負債・純資産 */}
        <div className="rounded border p-4 bg-white">
          <h3 className="font-bold mb-2">負債・純資産の部</h3>

          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-1">負債</div>
            <ul className="divide-y">
              {lines
                .filter((r) => r.section === "負債")
                .map((r) => (
                  <li key={r.account_code} className="py-1 flex justify-between">
                    <span className="truncate">{`「${r.account_name}」`}</span>
                    <span>{jpy(r.amount)}</span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-1">純資産</div>
            <ul className="divide-y">
              {lines
                .filter((r) => r.section === "純資産")
                .map((r) => (
                  <li key={r.account_code} className="py-1 flex justify-between">
                    <span className="truncate">{`「${r.account_name}」`}</span>
                    <span>{jpy(r.amount)}</span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="mt-3 space-y-1 text-right">
            <div>負債合計：{jpy(L)}</div>
            <div>純資産合計：{jpy(E)}</div>
            <div className="font-semibold">負債＋純資産合計：{jpy(creditTotal)}</div>
            {!equal && (
              <div className="text-red-600 text-sm">
                ※貸借不一致（資産≠負債＋純資産）／要データ確認
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
