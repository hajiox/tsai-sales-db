'use client';

import { useEffect, useState } from 'react';

type Overview = {
  month_start?: string;
  assets_total?: number;
  liabilities_total?: number;
  equity_total?: number;
  bs_diff?: number;
  revenues_total?: number;
  expenses_total?: number;
  net_income_signed?: number;
  pl_diff?: number;
};

const yen = (n?: number) =>
  n == null ? '-' : new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(n);

export default function FinanceOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [ov, setOv] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(''); // YYYY-MM
  const [busy, setBusy] = useState(false);

  const fetchLatest = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/finance/overview', { cache: 'no-store' });
      if (!r.ok) throw new Error(await r.text());
      setOv(await r.json());
    } catch (e:any) { setError(e?.message ?? String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLatest(); }, []);

  const fetchByMonth = async () => {
    if (!month) return;
    const date = `${month}-01`;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/finance/overview?date=${encodeURIComponent(date)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setOv({ month_start: date, ...data });
    } catch (e:any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  };

  const refreshMVs = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/finance/refresh', { method: 'POST' });
      if (!r.ok) throw new Error(await r.text());
      await fetchLatest();
    } catch (e:any) { setError(e?.message ?? String(e)); }
    finally { setBusy(false); }
  };

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Financial Overview (final)</h1>

      <section style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>月を指定</span>
          <input type="month" value={month} onChange={(e)=>setMonth(e.target.value)} style={{ padding:'6px 8px' }}/>
        </label>
        <button onClick={fetchByMonth} disabled={!month || busy}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd', background:'#fafafa' }}>
          この月を表示
        </button>
        <button onClick={fetchLatest} disabled={busy}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd', background:'#fafafa' }}>
          最新月を再取得
        </button>
        <button onClick={refreshMVs} disabled={busy}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd', background:'#eef7ff' }}>
          マテビュー更新
        </button>
      </section>

      {loading ? (
        <p>読み込み中...</p>
      ) : error ? (
        <div style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}><strong>エラー:</strong> {error}</div>
      ) : (
        <section style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12 }}>
          <Card title="対象月"><div style={{ fontSize:18 }}>{ov?.month_start ?? '-'}</div></Card>
          <Card title="資産合計">{yen(ov?.assets_total)}</Card>
          <Card title="負債合計">{yen(ov?.liabilities_total)}</Card>
          <Card title="純資産合計">{yen(ov?.equity_total)}</Card>
          <Card title="B/S差分 (A-(L+E))"><Diff value={ov?.bs_diff}/></Card>
          <Card title="収益合計（YTD）">{yen(ov?.revenues_total)}</Card>
          <Card title="費用合計（YTD）">{yen(ov?.expenses_total)}</Card>
          <Card title="当期純利益（YTD）">
            <span style={{ color:(ov?.net_income_signed ?? 0) >= 0 ? 'seagreen':'crimson' }}>
              {yen(ov?.net_income_signed)}
            </span>
          </Card>
          <Card title="P/L検算差 (NI-(R-E))"><Diff value={ov?.pl_diff}/></Card>
        </section>
      )}
    </main>
  );
}

function Card({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ border:'1px solid #eee', borderRadius:12, padding:14, background:'white' }}>
      <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>{title}</div>
      <div s
