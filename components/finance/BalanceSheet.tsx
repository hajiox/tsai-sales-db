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
  section: Side;
  account_code: string;
  account_name: string;
  amount: number | string;
};

type Props = {
  targetMonth: string | Date; // 'YYYY-MM-01' or Date
  warnThreshold?: number;     // 許容差（既定0）
};

const JPY = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

// 何が来ても 'YYYY-MM-01' を返す安全版
function toMonthFirstISO(input: unknown): string {
  if (input instanceof Date && !isNaN(input.getTime())) {
    const d = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), 1));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}-01`;
  }
  if (typeof input === "string") {
    const m = /^(\d{4})-(\d{2})/.exec(input);
    if (m) return `${m[1]}-${m[2]}-01`;
    const d = new Date(input);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      return `${yyyy}-${mm}-01`;
    }
  }
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export default function BalanceSheet({ targetMonth, warnThreshold = 0 }: Props) {
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

  const monthISO = useMemo(() => toMonthFirstISO(targetMonth), [targetMonth]);
  const monthDate = useMemo(() => new Date(monthISO), [monthISO]); // ← Dateで渡す

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // RPC を同時に呼ぶ（どちらも p_month は Date 型で渡す）
        const [totalsRes, snapsRes] = await Promise.all([
          supabase.rpc("bs_totals_signed_v1", { p_month: monthDate }),
          supabase.rpc("bs_snapshot_clean",   { p_month: monthDate }),
        ]);
        if (totalsRes.error) throw totalsRes.error;
        if (snapsRes.error) throw snapsRes.error;

        // totals の確実なマッピング
        const map: Record<Side, number> = { assets: 0, liabilities: 0, equity: 0 };
        for (const r of (totalsRes.data as TotalsRow[] | null) ?? []) {
          const side = String(r.side) as Side;
          const val = Number(r.total ?? 0);
          if (side in map) map[side] = val;
        }

        const snaps = ((snapsRes.data as SnapshotRow[] | null) ?? []).map((r) => ({
          ...r,
          amount: Number(r.amount ?? 0),
        }));

        if (!cancelled) {
          setTotals(map);
          setAssetsRows(snaps.filter((r) => r.section === "assets"));
          setLiabRows(snaps.filter((r) => r.section === "liabilities"));
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
  }, [supabase, monthDate]);

  // 検算（符号付き）：A - (L + E)
  const gap = totals.assets - (totals.liabilities + totals.equity);
  const ok = Math.abs(gap) <= Math.abs(warnThreshold ?? 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 左：資産 */}
      <div className="rounded-2xl border p-4">
        <h2 className="text-lg font-semibold mb-3">資産の部</h2>
        {loading ? (
          <p>読み込み中…</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <>
            <ul className="space-y-2 max-h-[60vh] overflow-auto pr-1">
              {assetsRows.map((r) => (
                <li key={`A-${r.account_code}`} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">「{r.account_name}」</span>
                  <span>{JPY.format(Math.abs(Number(r.amount)))}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between font-medium">
              <span>資産合計</span>
              <span>{JPY.format(Math.abs(totals.assets))}</span>
            </div>
          </>
        )}
      </div>

      {/* 右：負債・純資産 */}
      <div className="rounded-2xl border p-4">
        <h2 className="text-lg font-semibold mb-3">負債・純資産の部</h2>
        {loading ? (
          <p>読み込み中…</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <>
            <ul className="space-y-2 max-h-[46vh] overflow-auto pr-1">
              {liabRows.map((r) => (
                <li key={`L-${r.account_code}`} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">「{r.account_name}」</span>
                  <span>{JPY.format(Math.abs(Number(r.amount)))}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3 space-y-1">
              <div className="flex justify-between font-medium">
                <span>負債合計</span>
                <span>{JPY.format(Math.abs(totals.liabilities))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>純資産（検算は符号付き）</span>
                <span>{JPY.format(Math.abs(totals.equity))}</span>
              </div>
              <div className={`mt-2 text-sm ${ok ? "text-emerald-600" : "text-red-600"}`}>
                検算{ok ? "一致" : "不一致"}：差額 {JPY.format(gap)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
