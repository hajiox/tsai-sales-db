'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient, PostgrestError } from '@supabase/supabase-js';

// ---- Supabase browser client（公開鍵でOK：anonにEXECUTE付与済み） ----
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnon);

// ---- Types (RPC payload) ----
type MonthKey =
  | '8月' | '9月' | '10月' | '11月' | '12月'
  | '1月' | '2月' | '3月' | '4月' | '5月' | '6月' | '7月' | '計';

type Row = { row: string } & Partial<Record<MonthKey, number | null>>;
type SalesChannel = { channel_code: string; channel_name: string; rows: Row[] };
type Dashboard = {
  fy_start_year: number;
  sales_by_channel: SalesChannel[];
  sales_total: Row[];
  manual_kpis: Row[];
};

// ---- Helpers ----
const MONTHS: MonthKey[] = ['8月','9月','10月','11月','12月','1月','2月','3月','4月','5月','6月','7月','計'];

const nfYen = new Intl.NumberFormat('ja-JP');
const fmtYen = (v: number | null | undefined) =>
  v == null ? '' : nfYen.format(v);
const fmtPct = (v: number | null | undefined) =>
  v == null ? '' : `${v}%`;

const isPctRow = (label: string) => label.includes('%');
const isMoneyRow = (label: string) =>
  ['前年度実績','今年度目標','実績'].includes(label);

// ---- UI Components ----
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      <div className="rounded-2xl border border-gray-200 shadow-sm overflow-hidden bg-white">
        {children}
      </div>
    </section>
  );
}

function KPITable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left w-40">指標</th>
            {MONTHS.map(m => (
              <th key={m} className="px-2 py-2 text-right">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-2 font-medium whitespace-nowrap">{r.row}</td>
              {MONTHS.map(m => {
                const val = r[m];
                const display = isPctRow(r.row) ? fmtPct(val as number | null) : (isMoneyRow(r.row) ? fmtYen(val as number | null) : (val ?? '') );
                return (
                  <td key={m} className="px-2 py-2 text-right tabular-nums">{display}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Page() {
  const [fy, setFy] = useState<number>(2024);        // 8月開始の“開始年”
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<PostgrestError | null>(null);

  // fetch once or when fy changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase
        .rpc('get_dashboard_json_v1', { p_fy_start_year: fy });
      if (cancelled) return;
      if (error) {
        setErr(error);
        setData(null);
      } else {
        setData(data as Dashboard);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fy]);

  const channels = useMemo(() => data?.sales_by_channel ?? [], [data]);

  return (
    <main className="p-6 space-y-6 bg-gray-100 min-h-screen">
      <header className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">年度KPIダッシュボード</h1>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-600">FY開始年</label>
          <input
            type="number"
            value={fy}
            onChange={e => setFy(parseInt(e.target.value || '0', 10))}
            className="w-28 rounded-xl border px-3 py-2 text-sm"
          />
        </div>
      </header>

      {loading && (
        <div className="p-4 rounded-xl bg-white border shadow-sm">読み込み中…</div>
      )}
      {err && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
          エラー: {err.message}
        </div>
      )}
      {!loading && !err && data && (
        <>
          {/* チャネル別（4ブロック） */}
          {channels.map(ch => (
            <Section key={ch.channel_code} title={ch.channel_name}>
              <KPITable rows={ch.rows} />
            </Section>
          ))}

          {/* 全社トータル */}
          <Section title="全社トータル">
            <KPITable rows={data.sales_total} />
          </Section>

          {/* 製造・営業（手入力） */}
          <Section title="製造・営業KPI">
            <KPITable rows={data.manual_kpis} />
          </Section>

          {/* フッター */}
          <p className="text-xs text-gray-500">
            単位：金額＝円、％＝整数（分母が0のときは空欄）
          </p>
        </>
      )}
    </main>
  );
}
