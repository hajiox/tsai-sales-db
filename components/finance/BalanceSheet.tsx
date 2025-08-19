// ver.3 (2025-08-19 JST) - expose both named and default
"use client";
import React from "react";
import getSupabase from "@/lib/supabaseClient";

// 通貨表記
const jpy = (v: number) => (v < 0 ? `△¥${Math.abs(v).toLocaleString()}` : `¥${v.toLocaleString()}`);
// 型ゆるめ→数値正規化
const toNum = (v: any) =>
  typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : Number(v ?? 0) || 0;
// "2025-04" → "2025-04-01"
const normMonth = (m: string) => (m?.length === 7 ? `${m}-01` : m);

function BalanceSheet({ month }: { month: string }) {
  // Supabase クライアントをシングルトンから取得（ビルド時は null）
  const supabase = React.useMemo(
    () => (typeof window !== "undefined" ? getSupabase() : null),
    []
  );

  const [lines, setLines] = React.useState<any[]>([]);
  const [A, setA] = React.useState(0);
  const [L, setL] = React.useState(0);
  const [E, setE] = React.useState(0);
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

        const t = await supabase.rpc("bs_totals", { p_month: m });
        if (t.error) throw t.error;
        const a = toNum(t.data?.assets);
        const l = toNum(t.data?.liabilities);
        const e = toNum(t.data?.equity);

        const r = await supabase.rpc("bs_snapshot_clean", { p_month: m });
        if (r.error) throw r.error;
        const rows = (r.data ?? []).map((x: any) => ({ ...x, amount: toNum(x.amount) }));

        if (mounted) {
          setA(a);
          setL(l);
          setE(e);
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

  const ok = Math.round(A) === Math.round(L + E);
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
              <span className="tabular-nums">{jpy(l.amount)}</span>
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
              <span className="tabular-nums">{jpy(e.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
          <span>純資産計</span>
          <span className="tabular-nums">{jpy(E)}</span>
        </div>

        <div className="mt-4 flex justify-between border-t pt-3 font-semibold">
          <span>負債・純資産合計</span>
          <span className="tabular-nums">{jpy(L + E)}</span>
        </div>
        {!ok && <p className="mt-2 text-sm text-red-600">※集計不一致（資産≠負債+純資産）。</p>}
      </section>
    </div>
  );
}

// ver.3 (2025-08-19 JST) - expose both named and default
export { BalanceSheet };
export default BalanceSheet;
