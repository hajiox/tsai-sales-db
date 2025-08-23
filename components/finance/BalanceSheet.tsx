// /components/finance/BalanceSheet.tsx ver.8 (safe)
// 仕様：bs_snapshot_clean(p_month) だけを呼び、A/L/E と合計を前段で計算。
//       画面の右側「負債＋純資産合計」は (負債＋純資産) を符号付きで合算→絶対値。
//       検算は「資産＋負債＋純資産＝0」で行う。

"use client";

import React from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Line = {
  section: "資産" | "負債" | "純資産";
  account_code: string;
  account_name: string;
  amount: number; // 資産は＋、負債・純資産は－ で返る
};

const jpy = (v: number) =>
  v < 0 ? `▲¥${Math.abs(v).toLocaleString()}` : `¥${v.toLocaleString()}`;
const toNum = (v: any) =>
  typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : Number(v ?? 0) || 0;
const normMonth = (m?: string) => (m && m.length === 7 ? `${m}-01` : m);

export default function BalanceSheet({ month }: { month?: string }) {
  const [rows, setRows] = React.useState<Line[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // 表示用合計（正数表示）
  const [A, setA] = React.useState(0);
  const [L, setL] = React.useState(0);
  const [E, setE] = React.useState(0);
  const [creditTotal, setCreditTotal] = React.useState(0);

  // 検算用（符号付き）
  const [sA, setSA] = React.useState(0);
  const [sL, setSL] = React.useState(0);
  const [sE, setSE] = React.useState(0);

  const equal = Math.round(sA + sL + sE) === 0;

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const m = normMonth(month) ?? new Date().toISOString().slice(0, 10);
        const supabase = getSupabaseBrowserClient();

        // 明細を取得（ここだけを信頼）
        const { data, error } = await supabase.rpc("bs_snapshot_clean", { p_month: m });
        if (error) throw error;

        const list: Line[] = (data ?? []).map((r: any) => ({
          section: r.section,
          account_code: r.account_code,
          account_name: r.account_name,
          amount: toNum(r.amount),
        }));

        setRows(list);

        // 符号付きで合計
        const sum = (sec: Line["section"]) =>
          list.filter((x) => x.section === sec).reduce((s, x) => s + x.amount, 0);

        const SA = sum("資産");
        const SL = sum("負債");
        const SE = sum("純資産");

        setSA(SA);
        setSL(SL);
        setSE(SE);

        // 画面表示は正数。右の合計は (負債＋純資産) を符号付きで合算→絶対値
        setA(Math.abs(SA));
        setL(Math.abs(SL));
        setE(Math.abs(SE));
        setCreditTotal(Math.abs(SL + SE));
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
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
        {/* 左：資産 */}
        <div className="rounded border p-4 bg-white">
          <h3 className="font-bold mb-2">資産の部</h3>
          <ul className="divide-y">
            {rows
              .filter((r) => r.section === "資産")
              .map((r, i) => (
                <li key={`${r.account_code}-${i}`} className="py-1 flex justify-between">
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
              {rows
                .filter((r) => r.section === "負債")
                .map((r, i) => (
                  <li key={`${r.account_code}-${i}`} className="py-1 flex justify-between">
                    <span className="truncate">{`「${r.account_name}」`}</span>
                    <span>{jpy(r.amount)}</span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-1">純資産</div>
            <ul className="divide-y">
              {rows
                .filter((r) => r.section === "純資産")
                .map((r, i) => (
                  <li key={`${r.account_code}-${i}`} className="py-1 flex justify-between">
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
                ※貸借不一致（資産≠負債＋純資産）／データ確認が必要
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
