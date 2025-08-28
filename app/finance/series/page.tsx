'use client';

import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from 'chart.js';

// Chart.js を明示登録（auto は使わない）
ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

type OverviewRow = {
  month_start: string;
  assets_total: number;
  liabilities_total: number;
  equity_total: number;
  revenues_total: number;
  expenses_total: number;
  net_income_signed: number;
};

type PLMonthRow = {
  month_start: string;
  revenues_month: number;
  expenses_month: number;
  net_income_month: number;
};

const yen = (n?: number | null) =>
  n == null
    ? '-'
    : new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n);

function ChartCard({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 14, background: 'white', marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{title}</div>
      {children}
    </section>
  );
}

function Empty() {
  return <div style={{ padding: 16, color: '#666' }}>データがありません</div>;
}

export default function FinanceSeriesPage() {
  const [from, setFrom] = useState<string>(''); // YYYY-MM
  const [to, setTo] = useState<string>('');     // YYYY-MM
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ovRows, setOvRows] = useState<OverviewRow[]>([]);
  const [plmRows, setPlmRows] = useState<PLMonthRow[]>([]);

  const loadData = async (opts?: { from?: string; to?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const q: string[] = [];
      if (opts?.from) q.push(`from=${encodeURIComponent(`${opts.from}-01`)}`);
      if (opts?.to) q.push(`to=${encodeURIComponent(`${opts.to}-01`)}`);
      const qs = q.length ? `?${q.join('&')}` : '';
      const [ovRes, plmRes] = await Promise.all([
        fetch(`/api/finance/series${qs}`, { cache: 'no-store' }),
        fetch(`/api/finance/pl/month-totals`, { cache: 'no-store' }),
      ]);
      if (!ovRes.ok) throw new Error(await ovRes.text());
      if (!plmRes.ok) throw new Error(await plmRes.text());
      const ovJson = await ovRes.json();
      const plmJson = await plmRes.json();
      setOvRows(ovJson.rows ?? []);
      setPlmRows(plmJson.rows ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const labels = useMemo(() => ovRows.map((r) => r.month_start.slice(0, 7)), [ovRows]); // YYYY-MM

  const bsData = useMemo(
    () => ({
      labels,
      datasets: [
        { label: '資産', data: ovRows.map((r) => r.assets_total) },
        { label: '負債', data: ovRows.map((r) => r.liabilities_total) },
        { label: '純資産', data: ovRows.map((r) => r.equity_total) },
      ],
    }),
    [labels, ovRows]
  );

  const plYtdData = useMemo(
    () => ({
      labels,
      datasets: [
        { label: '収益（YTD）', data: ovRows.map((r) => r.revenues_total) },
        { label: '費用（YTD）', data: ovRows.map((r) => r.expenses_total) },
        { label: '当期純利益（YTD）', data: ovRows.map((r) => r.net_income_signed) },
      ],
    }),
    [labels, ovRows]
  );

  const plMonthLabels = useMemo(() => plmRows.map((r) => r.month_start.slice(0, 7)), [plmRows]);
  const plMonthData = useMemo(
    () => ({
      labels: plMonthLabels,
      datasets: [
        { label: '当月収益', data: plmRows.map((r) => r.revenues_month) },
        { label: '当月費用', data: plmRows.map((r) => r.expenses_month) },
        { label: '当月純利益', data: plmRows.map((r) => r.net_income_month) },
      ],
    }),
    [plMonthLabels, plmRows]
  );

  const search = async () => {
    await loadData({ from: from || undefined, to: to || undefined });
  };

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>推移グラフ（final）</h1>

      <section style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>From</span>
          <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '6px 8px' }} />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>To</span>
          <input type="month" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '6px 8px' }} />
        </label>
        <button
          onClick={search}
          disabled={busy}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fafafa' }}
        >
          この範囲で表示
        </button>
        <button
          onClick={() => {
            setFrom('');
            setTo('');
            loadData();
          }}
          disabled={busy}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fafafa' }}
        >
          全期間を表示
        </button>
      </section>

      {error && (
        <div style={{ color: 'crimson', whiteSpace: 'pre-wrap', marginBottom: 12 }}>
          <strong>エラー:</strong> {error}
        </div>
      )}

      <ChartCard title="B/S（資産・負債・純資産）">
        {ovRows.length ? <Line data={bsData} /> : <Empty />}
      </ChartCard>

      <ChartCard title="P/L（YTD：収益・費用・純利益）">
        {ovRows.length ? <Line data={plYtdData} /> : <Empty />}
      </ChartCard>

      <ChartCard title="P/L（当月：収益・費用・純利益）">
        {plmRows.length ? <Line data={plMonthData} /> : <Empty />}
      </ChartCard>

      <div style={{ marginTop: 16, color: '#666' }}>
        最終月：{labels.at(-1) ?? '-'} ／ 当月純利益：{yen(plmRows.at(-1)?.net_income_month)}
      </div>
    </main>
  );
}
