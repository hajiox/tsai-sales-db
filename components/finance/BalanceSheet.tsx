"use client";

import React from "react";
import { createClient } from "@supabase/supabase-js";

// ---------- helpers ----------
const jpy = (v: number) => (v < 0 ? `△¥${Math.abs(v).toLocaleString()}` : `¥${v.toLocaleString()}`);
const toNum = (v: any): number => {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// API client (browser-safe; anon key only)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------- types ----------
interface Line {
  section: "資産" | "負債" | "純資産" | string;
  account_code: string;
  account_name: string;
  amount: number | string | bigint; // will be normalized via toNum
}

interface TotalsRaw {
  assets: number | string | bigint | null;
  liabilities: number | string | bigint | null;
  equity: number | string | bigint | null;
}

// ---------- component ----------
export default function BalanceSheet({ month }: { month: string }) {
  const [lines, setLines] = React.useState<Line[] | null>(null);
  const [totals, setTotals] = React.useState<{ A: number; L: number; E: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 1) 合計（A, L, E）
        const tr = await supabase.rpc("bs_totals", { p_month: month });
        if (tr.error) throw tr.error;
        const t = (tr.data || {}) as TotalsRaw;
        const A = toNum(t.assets);
        const L = toNum(t.liabilities);
        const E = toNum(t.equity);

        // 2) 明細（0円やsheet系はDB側で除外済み）
        const lr = await supabase.rpc("bs_snapshot_clean", { p_month: month });
        if (lr.error) throw lr.error;
        const normalized = (lr.data || []).map((r: Line) => ({
          ...r,
          amount: toNum(r.amount),
        }));

        if (mounted) {
          setTotals({ A, L, E });
          setLines(normalized);
        }
      } catch (e: any) {
        if (mounted) setError(e?.message ?? String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [month]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-6 animate-pulse">
        <div className="h-72 rounded-2xl bg-gray-100" />
        <div className="h-72 rounded-2xl bg-gray-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
        データ取得に失敗しました：{error}
      </div>
    );
  }

  const A = totals?.A ?? 0;
  const L = totals?.L ?? 0;
  const E = totals?.E ?? 0;
  const ok = Math.round(A) === Math.round(L + E);

  const assets = (lines ?? []).filter((x) => x.section === "資産");
  const liabilities = (lines ?? []).filter((x) => x.section === "負債");
  const equity = (lines ?? []).filter((x) => x.section === "純資産");

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* 資産の部 */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">資産の部</h3>
        <ul className="divide-y">
          {assets.map((a) => (
            <li key={`${a.section}-${a.account_code}`} className="flex items-center justify-between py-2">
              <span className="truncate pr-2">「{a.account_name}」</span>
              <span className="tabular-nums">{jpy(toNum(a.amount))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t pt-3 font-semibold">
          <span>資産合計</span>
          <span className="tabular-nums">{jpy(A)}</span>
        </div>
      </section>

      {/* 負債・純資産の部 */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">負債・純資産の部</h3>

        <div className="mb-1 text-sm text-gray-500">負債</div>
        <ul className="divide-y">
          {liabilities.map((l) => (
            <li key={`${l.section}-${l.account_code}`} className="flex items-center justify-between py-2">
              <span className="truncate pr-2">「{l.account_name}」</span>
              <span className="tabular-nums">{jpy(toNum(l.amount))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t pt-3 font-semibold">
          <span>負債合計</span>
          <span className="tabular-nums">{jpy(L)}</span>
        </div>

        <div className="mt-6 mb-1 text-sm text-gray-500">純資産</div>
        <ul className="divide-y">
          {equity.map((e) => (
            <li key={`${e.section}-${e.account_code}`} className="flex items-center justify-between py-2">
              <span className="truncate pr-2">「{e.account_name}」</span>
              <span className="tabular-nums">{jpy(toNum(e.amount))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t pt-3 font-semibold">
          <span>純資産計</span>
          <span className="tabular-nums">{jpy(E)}</span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t pt-3 font-semibold">
          <span>負債・純資産合計</span>
          <span className="tabular-nums">{jpy(L + E)}</span>
        </div>

        {!ok && (
          <p className="mt-2 text-sm text-red-600">※集計不一致（資産≠負債+純資産）。DBに保存の`bs_totals`値を使用中です。データを確認してください。</p>
        )}
      </section>
    </div>
  );
}
