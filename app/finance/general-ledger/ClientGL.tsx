// app/finance/general-ledger/ClientGL.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/** APIから来る行（キーは揺れてもOKにする） */
type Row = Record<string, unknown>;
type Group = {
  fy: number;
  label: string;
  months: {
    ym: string;        // 'YYYY-MM'
    monthDate: string; // 'YYYY-MM-01'
    debit: number;
    credit: number;
    count: number;
  }[];
};

const YEN = (n: number) => `¥ ${Number(n || 0).toLocaleString()}`;

/* ユーティリティ */
function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = v.replace(/[¥,\s\u3000,]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** 文字列から 'YYYY-MM-01' を作る（幅広く受ける） */
function parseMonthStr(s: string): string | null {
  const t = s.trim();
  const mNum = t.match(/^(\d{4})(\d{1,2})(\d{2})?$/);                  // 202505 / 20250531
  if (mNum) return `${mNum[1]}-${mNum[2].padStart(2, '0')}-01`;
  const mYMD1 = t.match(/^(\d{4})[-/](\d{1,2})$/);                     // 2025-5 / 2025/05
  if (mYMD1) return `${mYMD1[1]}-${mYMD1[2].padStart(2, '0')}-01`;
  const mYMD2 = t.match(/^(\d{4})[-/](\d{1,2})[-/]\d{1,2}$/);          // 2025-05-01
  if (mYMD2) return `${mYMD2[1]}-${mYMD2[2].padStart(2, '0')}-01`;
  return null;
}

function normalizeMonth(r: Row): string | null {
  const cands = [
    r.target_month, r.month, r.ym, r.yyyymm, r.yyyymmdd, r.month_date, r.date,
    r.period, r.fiscal_month, r.fy_month, r.month_str,
  ];
  for (const c of cands) {
    if (!c) continue;
    const s = String(c);
    const m = parseMonthStr(s);
    if (m) return m;
  }
  return null;
}

/** 8月開始の会計年度 */
function monthToFY(monthDate: string): number {
  const [y, m] = monthDate.split('-').map((x) => Number(x));
  return m >= 8 ? y : y - 1;
}
const fyLabel = (fy: number) => `${fy}年度（${fy}年8月〜${fy + 1}年7月）`;

/** JSON→グルーピング（スケルトン補完や余計なUIは入れない） */
function toGroups(json: any): Group[] {
  const groupsSrc: any[] = json?.fiscal_years || json?.groups;
  if (Array.isArray(groupsSrc)) {
    const out: Group[] = [];
    for (const g of groupsSrc) {
      const rows: Row[] = (g.months || g.items || []) as Row[];
      const months = rows
        .map((r) => {
          const md = normalizeMonth(r);
          if (!md) return null;
          const ym = md.slice(0, 7);
          const debit =
            toNum(r.debit_total) || toNum(r.debit) || toNum(r.dr_total) || toNum(r.sum_debit);
          const credit =
            toNum(r.credit_total) || toNum(r.credit) || toNum(r.cr_total) || toNum(r.sum_credit);
          const count =
            Number(r.entry_count) || Number(r.count) || Number(r.rows) || 0;
          return { ym, monthDate: md, debit, credit, count };
        })
        .filter(Boolean) as Group['months'];

      const fy =
        Number(g.fy) ||
        Number(g.fiscal_year) ||
        (months[0] ? monthToFY(months[0].monthDate) : 0);

      out.push({
        fy,
        label: String(g.label || fyLabel(fy)),
        months: months.sort((a, b) => (a.ym < b.ym ? -1 : 1)),
      });
    }
    return out.sort((a, b) => b.fy - a.fy);
  }

  // flat配列系
  const rows: Row[] = json?.months || json?.rows || (Array.isArray(json) ? json : []);
  const map = new Map<number, Group>();
  for (const r of rows) {
    const md = normalizeMonth(r);
    if (!md) continue;
    const ym = md.slice(0, 7);
    const fy = monthToFY(md);
    const g = map.get(fy) || { fy, label: fyLabel(fy), months: [] as Group['months'] };
    const debit =
      toNum(r.debit_total) || toNum(r.debit) || toNum(r.dr_total) || toNum(r.sum_debit);
    const credit =
      toNum(r.credit_total) || toNum(r.credit) || toNum(r.cr_total) || toNum(r.sum_credit);
    const count =
      Number(r.entry_count) || Number(r.count) || Number(r.rows) || 0;
    g.months.push({ ym, monthDate: md, debit, credit, count });
    map.set(fy, g);
  }
  return Array.from(map.values())
    .map((g) => ({ ...g, months: g.months.sort((a, b) => (a.ym < b.ym ? -1 : 1)) }))
    .sort((a, b) => b.fy - a.fy);
}

/** 叩く候補は最小限に（UI安定優先） */
const ENDPOINTS = [
  '/api/finance/general-ledger',          // 第一候補（既存の可能性高）
  '/api/finance/general-ledger/summary',  // 予備
];

async function fetchGroups(): Promise<Group[]> {
  let last = '';
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { last = `${res.status} ${res.statusText}`; continue; }
      const json = await res.json();
      const g = toGroups(json);
      if (g.length) return g;
    } catch (e: any) {
      last = String(e?.message ?? e);
    }
  }
  throw new Error(last || '一覧データの取得に失敗しました。');
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
