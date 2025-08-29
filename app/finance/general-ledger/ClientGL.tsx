// app/finance/general-ledger/ClientGL.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/** APIの行（キーは揺れる想定） */
type Row = Record<string, unknown>;
type Group = {
  fy: number;
  label: string;
  months: {
    ym: string;        // 'YYYY-MM'
    monthDate: string; // 'YYYY-MM-01'
    debit: number;     // 画面表示用：費用（月）= 借方
    credit: number;    // 画面表示用：収益（月）= 貸方
    count: number;     // 不明なので 0 固定（必要ならAPIに合わせて増強）
  }[];
};

const YEN = (n: number) => `¥ ${Number(n || 0).toLocaleString()}`;

function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = v.replace(/[¥,\s\u3000]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** 文字列→ 'YYYY-MM-01'（幅広く許容） */
function parseMonthStr(s: string): string | null {
  const t = s.trim();
  const mNum = t.match(/^(\d{4})(\d{1,2})(\d{2})?$/);                 // 202505 / 20250531
  if (mNum) return `${mNum[1]}-${mNum[2].padStart(2, '0')}-01`;
  const m1 = t.match(/^(\d{4})[-/](\d{1,2})$/);                       // 2025-5 / 2025/05
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-01`;
  const m2 = t.match(/^(\d{4})[-/](\d{1,2})[-/]\d{1,2}$/);            // 2025-05-01
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-01`;
  return null;
}

function pickMonth(r: Row): string | null {
  const c = [
    r.month, r.target_month, r.ym, r.yyyymm, r.yyyymmdd, r.month_date, r.date, r.period,
  ];
  for (const v of c) {
    if (!v) continue;
    const s = String(v);
    const md = parseMonthStr(s);
    if (md) return md;
  }
  return null;
}

/** 8月開始FY */
function monthToFY(monthDate: string): number {
  const [y, m] = monthDate.split('-').map((n) => Number(n));
  return m >= 8 ? y : y - 1;
}
const fyLabel = (fy: number) => `${fy}年度（${fy}年8月〜${fy + 1}年7月）`;

/** `/api/finance/pl/month-totals` → Group[] へ正規化 */
function toGroups(json: any): Group[] {
  // 想定形式1：{ months: Row[] }
  const rows: Row[] = json?.months || json?.rows || (Array.isArray(json) ? json : []);
  const map = new Map<number, Group>();

  for (const r of rows) {
    const md = pickMonth(r);
    if (!md) continue;
    const ym = md.slice(0, 7);
    const fy = monthToFY(md);

    // 当月の収益/費用（名称が多少揺れても拾う）
    const revenue =
      toNum(r.revenues_month) || toNum(r.revenue_month) || toNum(r.revenues) || toNum(r.revenue);
    const expense =
      toNum(r.expenses_month) || toNum(r.expense_month) || toNum(r.expenses) || toNum(r.expense);

    const g = map.get(fy) || { fy, label: fyLabel(fy), months: [] };
    g.months.push({
      ym,
      monthDate: md,
      // 画面のラベルに合わせ「費用=借方」「収益=貸方」として表示
      debit: expense,
      credit: revenue,
      count: 0,
    });
    map.set(fy, g);
  }

  return Array.from(map.values())
    .map((g) => ({ ...g, months: g.months.sort((a, b) => (a.ym < b.ym ? -1 : 1)) }))
    .sort((a, b) => b.fy - a.fy);
}

async function fetchGroups(): Promise<Group[]> {
  const url = '/api/finance/pl/month-totals';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  const groups = toGroups(json);
  if (!groups.length) throw new Error('データなし');
  return groups;
}

/* 本体 */
export default function ClientGL() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const g = await fetchGroups();
        if (alive) setGroups(g);
      } catch (e: any) {
        if (alive) setError(String(e?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <p style={{ padding: 8 }}>読み込み中…</p>;
  if (error)   return <p style={{ padding: 8, color: '#b91c1c' }}>取得エラー: {error}</p>;
  if (!groups.length) return <p style={{ padding: 8 }}>表示できる月次データがありません。</p>;

  return (
    <div>
      {groups.map((g) => (
        <section
          key={g.fy}
          style={{
            border: '1px solid #eee',
            borderRadius: 12,
            background: 'white',
            marginBottom: 16,
            overflow: 'hidden',
          }}
        >
          <header
            style={{
              padding: 12,
              fontWeight: 700,
              borderBottom: '1px solid #f3f4f6',
              background: '#f9fafb',
            }}
          >
            {g.label}
          </header>

          <div style={{ padding: 12, display: 'grid', gap: 12 }}>
            {g.months.map((m) => (
              <article
                key={m.ym}
                style={{
                  border: '1px solid #eee',
                  borderRadius: 10,
                  padding: 12,
                  background: 'white',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15 }}>{m.ym}</div>
                  <div style={{ color: '#374151', fontSize: 13 }}>
                    仕訳件数: {m.count}　/　借方合計: {YEN(m.debit)}　/　貸方合計: {YEN(m.credit)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifySelf: 'end', flexWrap: 'wrap' }}>
                  <Link href={`/finance/general-ledger-detail?month=${m.monthDate}`} style={btn()}>
                    $ 財務諸表
                  </Link>
                </div>
              </article>
            ))}
            {g.months.length === 0 && <div style={{ color: '#6b7280' }}>この年度のデータはありません</div>}
          </div>
        </section>
      ))}
    </div>
  );
}

function btn(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 8,
    background: '#f9fafb',
    textDecoration: 'none',
    color: '#111',
    cursor: 'pointer',
    fontWeight: 600,
  };
}
