// BalanceSheet.tsx  ver.3
import { createClient } from '@supabase/supabase-js';

const jpy = (v: number) => (v < 0 ? `△¥${Math.abs(v).toLocaleString()}` : `¥${v.toLocaleString()}`);

export default async function BalanceSheet({ month }: { month: string }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  // 合計
  const { data: totals, error: te } = await supabase.rpc('bs_totals', { p_month: month });
  if (te) throw te;
  const A = Number(totals?.assets ?? 0);
  const L = Number(totals?.liabilities ?? 0);
  const E = Number(totals?.equity ?? 0);

  // 明細（クリーン）
  const { data: lines, error: le } = await supabase.rpc('bs_snapshot_clean', { p_month: month });
  if (le) throw le;

  const assets = (lines ?? []).filter((x: any) => x.section === '資産');
  const liabilities = (lines ?? []).filter((x: any) => x.section === '負債');
  const equity = (lines ?? []).filter((x: any) => x.section === '純資産');

  const ok = Math.round(A) === Math.round(L + E);

  return (
    <div className="grid grid-cols-2 gap-6">
      <section>
        <h3 className="font-bold mb-2">資産の部</h3>
        <ul className="space-y-1">
          {assets.map((a: any) => (
            <li key={a.account_code} className="flex justify-between">
              <span>「{a.account_name}」</span><span>{jpy(a.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 font-bold flex justify-between"><span>資産合計</span><span>{jpy(A)}</span></div>
      </section>

      <section>
        <h3 className="font-bold mb-2">負債・純資産の部</h3>

        <div className="mb-2">負債</div>
        <ul className="space-y-1">
          {liabilities.map((l: any) => (
            <li key={l.account_code} className="flex justify-between">
              <span>「{l.account_name}」</span><span>{jpy(l.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 font-bold flex justify-between"><span>負債合計</span><span>{jpy(L)}</span></div>

        <div className="mt-4 mb-2">純資産</div>
        <ul className="space-y-1">
          {equity.map((e: any) => (
            <li key={e.account_code} className="flex justify-between">
              <span>「{e.account_name}」</span><span>{jpy(e.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 font-bold flex justify-between"><span>純資産計</span><span>{jpy(E)}</span></div>

        <div className="mt-4 border-t pt-2 font-bold flex justify-between">
          <span>負債・純資産合計</span><span>{jpy(L + E)}</span>
        </div>
        {!ok && <p className="text-red-600 mt-1 text-sm">※集計不一致（資産≠負債+純資産）。</p>}
      </section>
    </div>
  );
}
