// /components/finance/BalanceSheet.tsx ver.7 (fix: use date-version bs_totals)
// - 合計は bs_totals(p_month date) を使用（1行: {assets, liabilities, equity}）
// - 右側の「負債＋純資産合計」は (負債 + 純資産) を符号付きで合算→ABS
// - 検算は「資産 + 負債 + 純資産 = 0」

"use client";

import React from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Line = {
  section: "資産" | "負債" | "純資産";
  account_code: string;
  account_name: string;
  amount: number; // 資産は＋、負債/純資産は−
};
type Totals = { assets?: number; liabilities?: number; equity?: number };

const jpy = (v: number) =>
  v < 0 ? `▲¥${Math.abs(v).toLocaleString()}` : `¥${v.toLocaleString()}`;
const toNum = (v: any) =>
  typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : Number(v ?? 0) || 0;
const normMonth = (m?: string) => (m && m.length === 7 ? `${m}-01` : m);

export default function BalanceSheet({ month }: { month?: string }) {
  const [rows, setRows] = React.useState<Line[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // 表示用（正数）
  const [A, setA] = React.useState(0);
  const [L, setL] = React.useState(0);
  const [E, setE] = React.useState(0);
  const [creditTotal, setCreditTotal] = React.useState(0);

  // 検算用（符号付き）
  const [sA, setSA] = React.useState(0);
  const [sL, setSL] = React.useState(0);
  const [sE, setSE] = React.useState(0);

  const equalSigned = Math.round(sA + sL + sE) === 0;
  const equalUI = Math.round(Math.abs(sA)) === Math.round(Math.abs(sL + sE));

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const m = normMonth(month) ?? new Date().toISOString().slice(0, 10);
        const supabase = getSupabaseBrowserClient();

        // ① 合計（date 版）
        const { data: tdata, error: terr } = await supabase.rpc("bs_totals", { p_month: m });
        if (terr) throw terr;
        const totals: Totals = (tdata?.[0] ?? {}) as Totals;

        const _sA = toNum(totals.assets);
        const _sL = toNum(totals.liabilities);
        const _sE = toNum(totals.equity);

        setSA(_sA);
        setSL(_sL);
        setSE(_sE);
        setA(Math.abs(_sA));
        setL(Math.abs(_sL));
        setE(Math.abs(_sE));
        setCreditTotal(Math.abs(_sL + _sE));

        // ② 明細
        const { data: sdata, error: serr } = await supabase.rpc("bs_snapshot_clean", {
          p_month: m,
        });
        if (serr) throw serr;

        const list: Line[] = (sdata ?? []).map((r: any) => ({
          section: r.section,
          account_code: r.account_code,
          account_name: r.account_name,
          amount: toNum(r.amount),
        }));
        setRows(list);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [month]);

  if (loading) return <div className="p-4 text-gray-500">loading…</div>;
  if (err) return <div className="p-4 text-red-700 bg-red-50 rounded">取得エラー：{String(err)}</div>;

  const assets = rows.filter((x) => x.section === "資産");
  const liabilities = rows.filter((x) => x.section === "負債");
  const equity = rows.filter((x) => x.section === "純資産");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 左：資産 */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">資産の部</h3>
        <ul className="divide-y">
          {assets.map((a) => (
            <li key={`${a.account_code}`} className="flex justify-between py-2">
              <span className="truncate pr-2">「{a.account_name}」</span>
              <span className="tabular-nums">{jpy(a.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
          <span>資産合計</span>
          <span className="tabular-nums">{jpy(A)}</span>
        </div>
      </section>

      {/* 右：負債・純資産 */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">負債・純資産の部</h3>

        <div className="mb-1 text-sm text-gray-500">負債</div>
        <ul className="divide-y">
          {liabilities.map((l) => (
            <li key={`${l.account_code}`} className="flex justify-between py-2">
              <span className="truncate pr-2">「{l.account_name}」</span>
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
            <li key={`${e.account_code}`} className="flex justify-between py-2">
              <span className="truncate pr-2">「{e.account_name}」</span>
              <span className="tabular-nums">{jpy(Math.abs(e.amount))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
          <span>純資産合計</span>
          <span className="tabular-nums">{jpy(E)}</span>
        </div>

        <div className="mt-4 flex justify-between border-t pt-3 font-semibold">
          <span>負債＋純資産合計</span>
          <span className="tabular-nums">{jpy(creditTotal)}</span>
        </div>

        {!equalUI && (
          <p className="mt-2 text-sm text-red-600">
            ※貸借不一致（資産≠負債＋純資産）。データ要確認
          </p>
        )}
        {!equalSigned && (
          <p className="mt-1 text-xs text-orange-600">※内部検算：資産＋負債＋純資産≠0</p>
        )}
      </section>
    </div>
  );
}
