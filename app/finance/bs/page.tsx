'use client';

import { useEffect, useState } from 'react';

type Totals = {
  month?: string | null;
  assets_total?: number | null;
  liabilities_total?: number | null;
  equity_total?: number | null;
  diff?: number | null;
};

type Row = {
  account_code: string;
  account_name: string;
  account_type: '資産' | '負債' | '純資産';
  balance_abs: number;
  balance_signed: number;
  is_fallback: boolean;
};

type SnapshotResp = { month: string | null; rows: Row[] };

const yen = (n?: number | null) =>
  n == null
    ? '-'
    : new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n);

function KPI({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 14, background: 'white' }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{children ?? '-'}</div>
    </div>
  );
}

export default function BSPage() {
  const [month, setMonth] = useState<string>(''); // YYYY-MM
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tot, setTot] = useState<Totals | null>(null);
  const [snap, setSnap] = useState<SnapshotResp | null>(null);

  const loadLatest = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, sRes] = await Promise.all([
        fetch('/api/finance/bs/totals', { cache: 'no-store' }),
        fetch('/api/finance/bs/snapshot', { cache: 'no-store' }),
      ]);
      if (!tRes.ok) throw new Error(await tRes.text());
      if (!sRes.ok) throw new Error(await sRes.text());
      setTot(await tRes.json());
      setSnap(await sRes.json());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLatest();
  }, []);

  const search = async () => {
    if (!month) return;
    const date = `${month}-01`;
    setBusy(true);
    setError(null);
    try {
      const [tRes, sRes] = await Promise.all([
        fetch(`/api/finance/bs/totals?date=${encodeURIComponent(date)}`, { cache: 'no-store' }),
        fetch(`/api/finance/bs/snapshot?date=${encodeURIComponent(date)}`, { cache: 'no-store' }),
      ]);
      if (!tRes.ok) throw new Error(await tRes.text());
      if (!sRes.ok) throw new Error(await sRes.text());
      const t = await tRes.json();
      const s = await sRes.json();
      setTot({ month: date, ...t });
      setSnap({ month: date, rows: s.rows });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>B/S Snapshot（final）</h1>

      <section style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>月を指定</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: '6px 8px' }} />
        </label>
        <button
          onClick={search}
          disabled={!month || busy}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fafafa' }}
        >
          この月を表示
        </button>
        <button
          onClick={loadLatest}
          disabled={busy}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fafafa' }}
        >
          最新月を再取得
        </button>
      </section>

      {loading ? (
        <p>読み込み中...</p>
      ) : error ? (
        <div style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}><strong>エラー:</strong> {error}</div>
      ) : (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
            <KPI title="対象月">{snap?.month ?? tot?.month ?? '-'}</KPI>
            <KPI title="資産合計">{yen(tot?.assets_total)}</KPI>
            <KPI title="負債合計">{yen(tot?.liabilities_total)}</KPI>
            <KPI title="純資産合計">{yen(tot?.equity_total)}</KPI>
            <KPI title="検算差 (A-(L+E))">
              <span style={{ color: (tot?.diff ?? 0) === 0 ? 'seagreen' : 'crimson' }}>
                {yen(tot?.diff)} {(tot?.diff ?? 0) === 0 ? '✅' : '⚠️'}
              </span>
            </KPI>
          </section>

          <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
                <tr>
                  <Th style={{ width: 90 }}>勘定科目コード</Th>
                  <Th>勘定科目名</Th>
                  <Th style={{ width: 90 }}>区分</Th>
                  <Th style={{ width: 160, textAlign: 'right' }}>金額（表示）</Th>
                  <Th style={{ width: 180, textAlign: 'right' }}>金額（符号付 検算）</Th>
                  <Th style={{ width: 110, textAlign: 'center' }}>差額補正</Th>
                </tr>
              </thead>
              <tbody>
                {(snap?.rows ?? []).map((r) => (
                  <tr key={r.account_code} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <Td mono>{r.account_code}</Td>
                    <Td>{r.account_name}</Td>
                    <Td>{r.account_type}</Td>
                    <Td align="right" mono>{yen(r.balance_abs)}</Td>
                    <Td align="right" mono style={{ color: r.balance_signed >= 0 ? 'seagreen' : 'crimson' }}>
                      {yen(r.balance_signed)}
                    </Td>
                    <Td align="center">{r.is_fallback ? '使用中 ⚠️' : '-'}</Td>
                  </tr>
                ))}
                {(!snap?.rows || snap.rows.length === 0) && (
                  <tr>
                    <td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#666' }}>データがありません</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid #eee', ...style }}>{children}</th>;
}
function Td({
  children,
  align,
  mono,
  style,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <td
      style={{
        padding: '10px 12px',
        textAlign: align ?? 'left',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' : undefined,
        ...style,
      }}
    >
      {children}
    </td>
  );
}
