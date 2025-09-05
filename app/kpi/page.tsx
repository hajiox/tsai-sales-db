// app/kpi/page.tsx
import 'server-only';
import { createClient } from '@supabase/supabase-js';

type AnyRow = Record<string, number | null | string>;
type ChannelBlock = { channel_code: string; channel_name: string; rows: AnyRow[] };
type Dashboard = {
  fy_start_year: number;
  sales_total: AnyRow[];
  sales_by_channel: ChannelBlock[];
  manual_kpis: AnyRow[];
};

const MONTHS = ['8月','9月','10月','11月','12月','1月','2月','3月','4月','5月','6月','7月','計'];

function fmt(v: number | null | string) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('ja-JP');
  return String(v);
}

function Table({ title, rows }: { title: string; rows: AnyRow[] }) {
  if (!rows?.length) return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <div className="text-sm text-gray-500">データなし</div>
    </section>
  );

  // 想定フォーマット: { row: '今年度目標', '8月':0, ..., '計':0 }
  const cols = ['row', ...MONTHS];

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <div className="overflow-x-auto rounded-2xl shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 text-left whitespace-nowrap">{c === 'row' ? '指標' : c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2 whitespace-nowrap">
                    {c === 'row' ? r['row'] as string : fmt(r[c] as number | null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function Page({ searchParams }: { searchParams?: { fy?: string } }) {
  const fy = Number(searchParams?.fy ?? 2024); // 例: /kpi?fy=2025
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!; // サーバ側のみ利用
  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { data, error } = await sb.rpc('get_dashboard_json_v1', { p_fy_start_year: fy });
  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">KPI ダッシュボード</h1>
        <div className="text-red-600 text-sm">RPCエラー: {error.message}</div>
      </main>
    );
  }

  const d = data as Dashboard;

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KPI ダッシュボード</h1>
        <div className="text-sm text-gray-600">FY {d.fy_start_year}（{d.fy_start_year}-08 〜 {d.fy_start_year + 1}-07）</div>
      </header>

      {/* 1) 全社トータル */}
      <Table title="全社トータル（売上）" rows={d.sales_total} />

      {/* 2) チャネル別 */}
      {d.sales_by_channel?.map((ch) => (
        <Table key={ch.channel_code} title={`${ch.channel_name}`} rows={ch.rows} />
      ))}

      {/* 3) 製造・営業KPI（手入力系） */}
      <Table title="製造・営業KPI" rows={d.manual_kpis} />
    </main>
  );
}
