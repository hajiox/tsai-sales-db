// app/finance/pl/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

type Scope = 'ytd' | 'month';

type PlRow = {
  account_code: string | number;
  account_name: string;
  category: '収益' | '費用' | string;
  // 金額系はいずれかが入ってくる（API差異を吸収）
  amount?: number | string | null;
  amount_signed?: number | string | null;
  signed_amount?: number | string | null;
  amount_display?: number | string | null;
  display_amount?: number | string | null;
  amount_abs?: number | string | null;
  value?: number | string | null;
};

type SnapshotRes = {
  target_month?: string;
  rows: PlRow[];
};

// 文字列金額 → number（¥/カンマ/空白/全角スペース対応）
function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = v.replace(/[¥,\s\u3000]/g, '').trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// 行から「表示用の絶対値」「符号付き」の2種類を安全に取得
function pickAmounts(row: PlRow): { abs: number; signed: number } {
  // 1) サーバーが符号付きの列を返す場合を最優先
  const signedCandidate =
    row.amount_signed ?? row.signed_amount ?? null;

  // 2) 表示用や生値の候補
  const displayCandidate =
    row.amount ?? row.amount_display ?? row.display_amount ?? row.amount_abs ?? row.value ?? null;

  // 3) 決定
  if (signedCandidate != null) {
    const s = toNum(signedCandidate);
    return { abs: Math.abs(s), signed: s };
  }
  // 符号付きが無ければ、区分で符号を付ける（P/L規約：収益＋／費用−）
  const base = toNum(displayCandidate);
  const signed = row.category === '費用' ? -Math.abs(base) : Math.abs(base);
  return { abs: Math.abs(base), signed };
}

function yen(n: number): string {
  return `¥ ${Number(n || 0).toLocaleString()}`;
}

export default function PlPage() {
  const [scope, setScope] = useState<Scope>('ytd');
  const [month, setMonth] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<SnapshotRes>({ rows: [] });
  const [error, setError] = useState<string>('');

  async function fetchSnapshot(s: Scope, m?: string) {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      qs.set('scope', s);
      if (m) qs.set('month', m);
      const res = await fetch(`/api/finance/pl/snapshot?${qs.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = (await res.json()) as SnapshotRes;
      setData({ rows: json.rows ?? [], target_month: json.target_month });
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setData({ rows: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSnapshot(scope, month || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const { revenueTotal, expenseTotal, netIncome, displayRows } = useMemo(() => {
    let rev = 0;
    let exp = 0;

    const rows = (data.rows ?? []).map((r) => {
      const { abs, signed } = pickAmounts(r);
      // 合計は区分で分けて加算（収益は＋、費用は＋で保持）
      if (r.category === '収益') rev += Math.abs(signed); // 収益はプラス計上
      else if (r.category === '費用') exp += Math.abs(signed); // 費用はプラス計上
      return {
        ...r,
        displayAmount: abs,
        signedAmount: signed, // 収益＋／費用− に正規化済み
      };
    });

    return {
      revenueTotal: rev,
      expenseTotal: exp,
      netIncome: rev - exp, // 純利益 = 収益 − 費用
      displayRows: rows,
    };
  }, [data.rows]);

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        P/L Snapshot（{scope === 'ytd' ? 'FY累計' : '当月'}）
      </h1>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label>月を指定</label>
        <input
          type="month"
          value={month ? month.slice(0, 7) : ''}
          onChange={(e) => setMonth(e.target.value ? `${e.target.value}-01` : '')}
          style={{ padding: 6, border: '1px solid #ddd', borderRadius: 6 }}
        />
        <button onClick={() => fetchSnapshot(scope, month || undefined)} style={btn()}>この条件で表示</button>
        <button onClick={() => { setMonth(''); setScope('ytd'); fetchSnapshot('ytd'); }} style={btn()}>
          最新月（FY累計）に戻る
        </button>
        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          <button onClick={() => setScope('ytd')} style={tab(scope === 'ytd')} aria-pressed={scope === 'ytd'}>
            FY累計
          </button>
          <button onClick={() => setScope('month')} style={tab(scope === 'month')} aria-pressed={scope === 'month'}>
            当月
          </button>
        </div>
      </div>

      {/* 指標 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
        <StatCard title="収益合計（YTD）" value={yen(revenueTotal)} />
        <StatCard title="費用合計（YTD）" value={yen(expenseTotal)} />
        <StatCard title="純利益" value={yen(netIncome)} danger={netIncome < 0} />
      </div>

      {loading && <p>読み込み中...</p>}
      {error && <p style={{ color: '#b91c1c', marginBottom: 12 }}>取得エラー: {error}</p>}

      <div style={{ marginBottom: 8, color: '#374151' }}>対象月: {data?.target_month ? data.target_month : '-'}</div>

      {/* テーブル */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', background: 'white', border: '1px solid #eee' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              <Th>勘定科目コード</Th>
              <Th>勘定科目名</Th>
              <Th>区分</Th>
              <Th>金額（表示）</Th>
              <Th>金額（符号付 検算）</Th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r, i) => (
              <tr key={`${r.account_code}-${i}`} style={{ borderTop: '1px solid #f3f4f6' }}>
                <Td>{r.account_code}</Td>
                <Td>{r.account_name}</Td>
                <Td>{r.category}</Td>
                <Td>{yen((r as any).displayAmount)}</Td>
                <Td style={{ color: (r as any).signedAmount < 0 ? '#b91c1c' : '#111827' }}>
                  {yen((r as any).signedAmount)}
                </Td>
              </tr>
            ))}
            {displayRows.length === 0 && !loading && (
              <tr>
                <Td colSpan={5} style={{ textAlign: 'center', padding: 16 }}>データがありません</Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function btn(): React.CSSProperties {
  return { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, background: '#f9fafb', cursor: 'pointer' };
}

function tab(active: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    border: '1px solid #ddd',
    borderRadius: 8,
    background: active ? '#111827' : '#f9fafb',
    color: active ? '#fff' : '#111',
    cursor: 'pointer',
  };
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: 'left', padding: 10, fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  );
}

function Td({ children, colSpan, style }: { children: React.ReactNode; colSpan?: number; style?: React.CSSProperties }) {
  return <td style={{ padding: 10, whiteSpace: 'nowrap', ...style }} colSpan={colSpan}>{children}</td>;
}

function StatCard({ title, value, danger }: { title: string; value: string; danger?: boolean }) {
  return (
    <div style={{ padding: 14, border: '1px solid #eee', borderRadius: 12, background: 'white' }}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: danger ? '#b91c1c' : '#111827' }}>{value}</div>
    </div>
  );
}
