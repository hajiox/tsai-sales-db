// /components/finance/BalanceSheet.tsx ver.6 (2025-08-22 JST)
// 変更点：bs_totals を text版(target_month)ではなく date版(p_month)に統一。
//         戻り値は 1行 {assets, liabilities, equity} を想定。
//         "YYYY-MM" が渡ってきた時は "YYYY-MM-01" に正規化して呼び出し。
// ----------------------------------------------------------------

"use client";

import React from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// 通貨表記（▲はマイナス表示）
const jpy = (v: number) => (v < 0 ? `▲¥${Math.abs(v).toLocaleString()}` : `¥${v.toLocaleString()}`);
// 数値化ユーティリティ
const toNum = (v: any) =>
  typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : Number(v ?? 0) || 0;
// "2025-08" → "2025-08-01"
const normMonth = (m?: string) => {
  if (!m) return undefined;
  return m.length === 7 ? `${m}-01` : m;
};

// RPC戻り値型（date版 bs_totals は 1行で返る）
type BsTotalsRow = { assets?: number; liabilities?: number; equity?: number };
type BsLine = {
  section: "資産" | "負債" | "純資産";
  account_code: string;
  account_name: string;
  amount: number;
};

type Props = {
  // 親から "YYYY-MM" か "YYYY-MM-01" が来る想定。未指定なら当日。
  month?: string;
};

export default function BalanceSheet({ month }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [A, setA] = React.useState(0);
  const [L, setL] = React.useState(0);
  const [E, setE] = React.useState(0);
  const [lines, setLines] = React.useState<BsLine[]>([]);

  // 合計が一致しているか
  const equal = Math.round(A) === Math.round(L + E);

  React.useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        const m = normMonth(month) ?? new Date().toISOString().slice(0, 10); // 既定は当日

        const supabase = getSupabaseBrowserClient();

        // --- 合計（date版 bs_totals） ----------------------------
        // 戻り値は [ { assets, liabilities, equity } ]
        const { data: totalsData, error: totalsErr } = await supabase.rpc("bs_totals", {
          p_month: m,
        });
        if (totalsErr) throw totalsErr;
        const totals: BsTotalsRow = (totalsData?.[0] ?? {}) as BsTotalsRow;

        const assets = Math.abs(toNum((totals as any).assets));
        const liabilities = Math.abs(toNum((totals as any).liabilities));
        const equity = Math.abs(toNum((totals as any).equity));

        // --- 明細（bs_snapshot_clean） ---------------------------
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

        setA(assets);
        setL(liabilities);
        setE(equity);
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
            <div className="font-semibold">負債＋純資産合計：{jpy(L + E)}</div>
            {!equal && (
              <div className="text-red-600 text-sm">
                ※貸借不一致（資産≠負債＋純資産）
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
