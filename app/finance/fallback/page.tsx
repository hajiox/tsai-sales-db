'use client';

import { useEffect, useMemo, useState } from 'react';

type Row = {
  month_start: string;       // YYYY-MM-DD
  fallback_signed: number;   // 0以外ならフォールバック使用
  used_fallback: boolean;
};

const yen = (n?: number | null) =>
  n == null
    ? '-'
    : new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n);

export default function EquityFallbackFlagsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(''); // YYYY-MM
  const [to, setTo] = useState('');     // YYYY-MM

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/finance/equity-fallback-flags', { cache: 'no-store' });
      if (!r.ok) throw new Error(await r.text());
      const json = await r.json();
      setRows(json.rows ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtRows = useMemo(() => {
    const f = from ? `${from}-01` : null;
    const t = to ? `${to}-01` : null;
    return rows.filter(r => (!f || r.month_start >= f) && (!t || r.month_start <= t));
  }, [rows, from, to]);

  const latest = rows[0];

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>フォールバック監視（純資産の差額補正）</h1>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KPI title="最新月">
          <div style={{ fontSize: 18 }}>{latest?.month_start ?? '-'}</div>
        </KPI>
        <KPI title="最新月の差額補正額（符号付）">
          <span style={{ color: (latest?.fallback_signed ?? 0) === 0 ? 'seagreen' : 'crimson' }}>
            {yen(latest?.fallback_signed)} {(latest?.fallback_signed ?? 0) === 0 ? '✅未使用' : '⚠️使用中'}
          </span>
        </KPI>
        <KPI title="状態">
          {latest ? (latest.used_fallback ? '使用中 ⚠️' : '未使用 ✅') : '-'}
        </KPI>
      </section>

      <section style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>From</span>
          <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '6px 8px' }} />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>To</span>
          <input type="month" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '6px 8px' }} />
        </label>
        <button
          onClick={() => { setFrom(''); setTo(''); }}
          disabled={busy}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fafafa' }}
        >
          クリア
        </button>
        <button
          onClick={load}
          disabled={busy}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#eef7ff' }}
        >
          最新取得
        </button>
      </section>

      {error && (
        <div style={{ color: 'crimson', whiteSpace: 'pre-wrap', marginBottom: 12 }}>
          <strong>エラー:</strong> {error}
        </div>
      )}

      <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
            <tr>
              <Th style={{ width: 130 }}>月</Th>
              <Th style={{ width: 200, textAlign: 'right' }}>差額補正額（符号付）</Th>
              <Th style={{ width: 130, textAlign: 'center' }}>使用状況</Th>
            </tr>
          </thead>
          <tbody>
            {filtRows.map((r) => (
              <tr key={r.month_start} style={{ borderTop: '1px solid #f0f0f0' }}>
                <Td>{r.month_start}</Td>
                <Td align="right" mono style={{ color: r.fallback_signed === 0 ? 'seagreen' : 'crimson' }}>
                  {yen(r.fallback_signed)}
                </Td>
                <Td align="center">{r.used_fallback ? '使用中 ⚠️' : '未使用 ✅'}</Td>
              </tr>
            ))}
            {filtRows.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 16, textAlign: 'center', color: '#666' }}>データがありません</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function KPI({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 14, background: 'white' }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{children ?? '-'}</div>
    </div>
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
        fontFamily: mono
          ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
          : undefined,
        ...style,
      }}
    >
      {children}
    </td>
  );
}
