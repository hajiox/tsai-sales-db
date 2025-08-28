'use client';

import { useEffect, useMemo, useState } from 'react';

type Row = {
  account_code: string;
  account_name: string;
  account_type: '収益' | '費用' | '営業外収益' | '営業外費用';
  amount_abs: number;
  amount_signed: number; // 収益＋／費用−
};

type ApiResp = {
  month: string | null;
  scope: 'ytd' | 'month';
  rows: Row[];
};

const yen = (n?: number) =>
  n == null
    ? '-'
    : new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n);

export default function PLPage() {
  const [scope, setScope] = useState<'ytd' | 'month'>('ytd');
  const [month, setMonth] = useState<string>(''); // YYYY-MM
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/finance/pl/snapshot', { cache: 'no-store' });
      if (!r.ok) throw new Error(await r.text());
      const json: ApiResp = await r.json();
      setData(json);
      setScope('ytd');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLatest(); }, []);

  const search = async () => {
    if (!month) return;
    const date = `${month}-01`;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/finance/pl/snapshot?date=${encodeURIComponent(date)}&scope=${scope}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(await r.text());
      const json: ApiResp = await r.json();
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const totals = useMemo(() => {
    const rows = data?.rows ?? [];
    const revenues = rows.reduce((s, r) => s + (r.amount_signed >= 0 ? r.amount_signed : 0), 0);
    const expenses = rows.reduce((s, r) => s + (r.amount_signed < 0 ? -r.amount_signed : 0), 0);
    const ni = rows.reduce((s, r) => s + r.amount_signed, 0);
    return { revenues, expenses, ni };
  }, [data]);

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        P/L Snapshot ({scope === 'ytd' ? 'FY累計' : '当月のみ'})
      </h1>

      <section style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>月を指定</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: '6px 8px' }} />
        </label>

        <div style={{ display: 'inline-flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
          <button
            onClick={() => setScope('ytd')}
            style={{ padding: '8px 12px', background: scope === 'ytd' ? '#eef7ff' : '#fff', borderRight: '1px solid #ddd' }}
          >
            FY累計
          </button>
          <button
            onClick={() => setScope('month')}
            style={{ padding: '8px 12px', background: scope === 'month' ? '#eef7ff' : '#fff' }}
          >
            当月
          </button>
        </div>

        <button
          onClick={search}
          disabled={!month || busy}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fafafa' }}
        >
          この条件で表示
        </button>

        <button
          onClick={loadLatest}
          disabled={busy}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fafafa' }}
        >
          最新月（FY累計）に戻る
        </button>
      </section>

      {loading ? (
        <p>読み込み中...</p>
      ) : error ? (
        <div style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}><strong>エラー:</strong> {error}</div>
      ) : (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
            <KPI title="対象月">{data?.month ?? '-'}</KPI>
            <KPI title="収益合計">{yen(totals.revenues)}</KPI>
            <KPI title="費用合計">{yen(totals.expenses)}</KPI>
            <KPI title="純利益">
              <span style={{ color: totals.ni >= 0 ? 'seagreen' : 'crimson' }}>{yen(totals.ni)}</span>
            </KPI>
          </section>

          <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
                <tr>
                  <Th style={{ width: 90 }}>勘定科目コード</Th>
                  <Th>勘定科目名</Th>
                  <Th style={{ width: 110 }}>区分</Th>
                  <Th style={{ width: 140, textAlign: 'right' }}>金額（表示）</Th>
                  <Th style={{ width: 160, textAlign: 'right' }}>金額（符号付 検算）</Th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r) => (
                  <tr key={r.account_code} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <Td mono>{r.account_code}</Td>
                    <Td>{r.account_name}</Td>
                    <Td>{r.account_type}</Td>
                    <Td align="right" mono>{yen(r.amount_abs)}</Td>
                    <Td align="right" mono style={{ color: r.amount_signed >= 0 ? 'seagreen' : 'crimson' }}>
                      {yen(r.amount_signed)}
                    </Td>
                  </tr>
                ))}
                {(!data?.rows || data.rows.length === 0) && (
                  <tr>
                    <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#666' }}>データがありません</td>
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
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' : undefined,
        ...style,
      }}
    >
      {children}
    </td>
  );
}
