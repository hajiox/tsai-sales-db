// /components/finance/BalanceSheet.tsx
// ver.5 (2025-08-23) — B/S 検算を “符号付き純資産” に修正し、RPCを bs_totals_signed_v1 に切替
//  - UI表示は絶対値のまま（見た目用）
//  - 検算は assets - (liabilities + equitySigned) を採用
//  - Supabase クライアントはブラウザ用の単一起点から取得

"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Side = "assets" | "liabilities" | "equity";

type TotalsRow = {
  side: Side;
  total: number; // numeric が文字列で返る環境もあるので後で Number(...) します
};

type SnapshotRow = {
  section: "assets" | "liabilities" | "equity";
  account_code: string;
  account_name: string;
  amount: number; // 表示は絶対値を使う
};

type Props = {
  /** 'YYYY-MM-01' 形式 or Date。内部で 'YYYY-MM-01' に正規化します。 */
  targetMonth: string | Date;
  /** 乖離を警告表示する閾値（円）。デフォルト: 0（完全一致のみ OK） */
  warnThreshold?: number;
};

const JPY = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

function toMonthFirstISO(x: string | Date): string {
  if (x instanceof Date) {
    const d = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}-01`;
  }
  // 文字列は YYYY-MM または YYYY-MM-01 を想定
  const m = x.match(/^(\d{4})-(\d{2})/);
  if (!m) return x;
  return `${m[1]}-${m[2]}-01`;
}

export default function BalanceSheet({ targetMonth, warnThreshold = 0 }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totals, setTotals] = useState<Record<Side, number>>({ assets: 0, liabilities: 0, equity: 0 });
  const [assetsRows, setAssetsRows] = useState<SnapshotRow[]>([]);
  const [liabRows, setLiabRows] = useState<SnapshotRow[]>([]);

  const monthISO = toMonthFirstISO(targetMonth);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // 1) 符号付きトータル（重要）
        const { data: totalsData, error: totalsErr } = await supabase
          .rpc("bs_totals_signed_v1", { p_month: monthISO })
          .select();

        if (totalsErr) throw totalsErr;
        const find = (k: Side) =>
          Number((totalsData as TotalsRow[] | null)?.find((r) => r.side === k)?.total ?? 0);

        const assets = find("assets");
        const liabilities = find("liabilities");
        const equitySigned = find("equity");

        // 2) 行明細（表示用）
        const { data: snapData, error: snapErr } = await supabase
          .rpc("bs_snapshot_clean", { p_month: monthISO })
          .select();
        if (snapErr) throw snapErr;

        const rows = (snapData ?? []) as SnapshotRow[];
        const aRows = rows.filter((r) => r.section === "assets");
        const lRows = rows.filter((r) => r.section === "liabilities");

        if (!cancelled) {
          setTotals({ assets, liabilities, equity: equitySigned });
          setAssetsRows(aRows);
          setLiabRows(lRows);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "データ取得に失敗しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, monthISO]);

  const gap = useMemo(() => {
    // 検算（符号付き）: A - (L + E)
    return totals.assets - (totals.liabilities + totals.equity);
  }, [totals]);

  const display = {
    assets: Math.abs(totals.assets),
    liabilities: Math.abs(totals.liabilities),
    equity: Math.abs(totals.equity), // 見た目は絶対値でOK
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 左：資産の部 */}
      <div className="rounded-2xl border p-4">
        <h2 className="text-lg font-semibold mb-3">資産の部</h2>
        <ul className="space-y-2 max-h-[70vh] overflow-auto pr-1">
          {assetsRows.map((r) => (
            <li key={`${r.section}-${r.account_code}`} className="flex justify-between text-sm">
              <span className="text-muted-foreground">「{r.account_name}」</span>
              <span>{JPY.format(Math.abs(Number(r.amount ?? 0)))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t pt-3 font-semibold">
          <span>資産合計</span>
          <span>{JPY.format(display.assets)}</span>
        </div>
      </div>

      {/* 右：負債・純資産の部 */}
      <div className="rounded-2xl border p-4">
        <h2 className="text-lg font-semibold mb-3">負債・純資産の部</h2>

        <h3 className="text-sm font-medium mb-2 text-muted-foreground">負債</h3>
        <ul className="space-y-2">
          {liabRows.map((r) => (
            <li key={`${r.section}-${r.account_code}`} className="flex justify-between text-sm">
              <span className="text-muted-foreground">「{r.account_name}」</span>
              <span>{JPY.format(Math.abs(Number(r.amount ?? 0)))}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex justify-between font-semibold">
          <span>負債合計</span>
          <span>{JPY.format(display.liabilities)}</span>
        </div>

        <div className="mt-6 flex justify-between text-sm">
          <span className="text-muted-foreground">純資産（符号付きで検算）</span>
          <span className={totals.equity < 0 ? "text-red-600 font-semibold" : "font-semibold"}>
            {JPY.format(display.equity)}
            {totals.equity < 0 ? "（マイナス）" : ""}
          </span>
        </div>

        <div className="mt-2 flex justify-between border-t pt-3 font-semibold">
          <span>負債＋純資産合計（＝負債＋純資産[符号付き]）</span>
          <span>{JPY.format(totals.liabilities + totals.equity)}</span>
        </div>

        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">読込中…</p>
          ) : error ? (
            <p className="text-sm text-red-600">取得エラー：{error}</p>
          ) : Math.abs(gap) <= warnThreshold ? (
            <p className="text-sm text-emerald-600">検算一致：差額 {JPY.format(gap)}</p>
          ) : (
            <div className="text-sm">
              <p className="text-red-600 font-semibold">
                検算不一致（資産 −（負債＋純資産[符号付き]） ≠ 0）
              </p>
              <p className="text-muted-foreground">
                差額：{JPY.format(gap)}／月：{monthISO}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
