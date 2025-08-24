"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Side = "assets" | "liabilities" | "equity";

type TotalsRow = {
  side: Side;
  total: number | string;
};

type SnapshotRow = {
  section: "assets" | "liabilities" | "equity";
  account_code: string;
  account_name: string;
  amount: number | string;
};

type Props = {
  targetMonth: string | Date; // 'YYYY-MM-01' か Date
  warnThreshold?: number;     // 許容差
};

const JPY = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

function toMonthFirstISO(x: string | Date): string {
  if (x instanceof Date) {
    const d = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}-01`;
  }
  const m = (x as string).match?.(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-01` : String(x);
}

export default function BalanceSheet({ targetMonth, warnThreshold = 0 }: Props) {
  // ✔ ここで1回だけ取得（関数でもインスタンスでもOK）
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totals, setTotals] = useState<Record<Side, number>>({
    assets: 0,
    liabilities: 0,
    equity: 0, // ← 符号付き
  });
  const [assetsRows, setAssetsRows] = useState<SnapshotRow[]>([]);
  const [liabRows, setLiabRows] = useState<SnapshotRow[]>([]);

  const monthISO = toMonthFirstISO(targetMonth);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // 1) 符号付きトータル（RPCに .select() は付けない）
        const { data: totalsData, error: totalsErr } = await supabase.rpc(
          "bs_totals_signed_v1",
          { p_month: monthISO }
        );
        if (totalsErr) throw totalsErr;

        const rows = (totalsData as TotalsRow[]) || [];
        const pick = (k: Side) => Number(rows.find((r) => r.side === k)?.total ?? 0);

        const assets = pick("assets");
        const liabilities = pick("liabilities");
        const equitySigned = pick("equity");

        // 2) 明細（表示用）
        const { data: snapData, error: snapErr } = await supabase.rpc(
          "bs_snapshot_clean",
          { p_month: monthISO }
        );
        if (snapErr) throw snapErr;

        const snaps = (snapData as SnapshotRow[]) || [];
        const aRows = snaps.filter((r) => r.section === "assets");
        const lRows = snaps.filter((r) => r.section === "liabilities");

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

  // 検算（符号付き）：A - (L + E)
  const gap = useMemo(
    () => totals.assets - (totals.liabilities + totals.equity),
    [totals]
  );

  const display = {
    assets: Math.abs(totals.assets),
    liabilities: Math.abs(totals.liabilities),
    equity: Math.abs(totals.equity),
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 左：資産 */}
      <div className="rounded-2xl border p-4">
        <h2 className="text-lg font-semibold mb-3">資産の部</h2>
        <ul className="space-y-2 max-h-[70vh] overflow-auto pr-1">
          {assetsRows.map((r) => (
            <li key={`A-${r.account_code}`} className="flex justify-between text-sm">
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

      {/* 右：負債・純資産 */}
      <div className="rounded-2xl border p-4">
        <h2 className="text-lg font-semibold mb-3">負債・純資産の部</h2>

        <h3 className="text-sm font-medium mb-2 text-muted-foreground">負債</h3>
        <ul className="space-y-2 max-h-[55vh] overflow-auto pr-1">
          {liabRows.map((r) => (
            <li key={`L-${r.account_code}`} className="flex justify-between text-sm">
              <span className="text-muted-foreground">「{r.account_name}」</span>
              <span>{JPY.format(Math.abs(Number(r.amount ?? 0)))}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex justify-between font-semibold">
          <span>負債合計</span>
          <span>{JPY.format(display.liabilities)}</span>
        </div>

        <div className="mt-4 flex justify-between text-sm">
          <span className="text-muted-foreground">純資産（検算は符号付き）</span>
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
              <p className="text-muted-foreground">差額：{JPY.format(gap)}／月：{monthISO}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
