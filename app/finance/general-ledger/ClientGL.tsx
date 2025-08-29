// app/finance/general-ledger/ClientGL.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

// ===== 型（ゆるめ） =====
type MonthSummaryAny = Record<string, unknown>;
type Group = {
  fy: number; // 例: 2024（8月始まり: 2024/08〜2025/07）
  label: string;
  months: Array<{
    ym: string; // 'YYYY-MM'（表示用）
    monthDate: string; // 'YYYY-MM-01'（リンク等に使用）
    debit: number;
    credit: number;
    count: number;
  }>;
};

// ===== ユーティリティ =====
const YEN = (n: number) => `¥ ${Number(n || 0).toLocaleString()}`;

/** number|string|null → number（カンマ・円記号除去） */
function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = v.replace(/[¥,\s\u3000]/g, '').trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** '2024-05'|'2024-05-01'|'202405'|'2024/05' など → 'YYYY-MM-01' */
function normalizeMonthString(o: MonthSummaryAny): string | null {
  const cand = [
    o.target_month,
    o.month,
    o.ym,
    o.yyyymm,
    o.month_date,
    o.date,
  ] as Array<unknown>;

  for (const c of cand) {
    if (!c) continue;
    const s = String(c).trim();
    // 202405 or 2024/05 or 2024-05 or 2024-05-01
    const m1 = s.match(/^(\d{4})(\d{2})$/); // 202405
    if (m1) return `${m1[1]}-${m1[2]}-01`;
    const m2 = s.match(/^(\d{4})[-/](\d{2})$/); // 2024-05 or 2024/05
    if (m2) return `${m2[1]}-${m2[2]}-01`;
    const m3 = s.match(/^(\d{4})[-/](\d{2})[-/]\d{2}$/); // 2024-05-01
    if (m3) return `${m3[1]}-${m3[2]}-01`;
  }
  return null;
}

/** 月→会計年度（8月開始） */
function monthToFY(monthDate: string): number {
  const [y, m] = monthDate.split('-').map((x) => Number(x));
  return m >= 8 ? y : y - 1;
}

function fyLabel(fy: number): string {
  // 西暦のみの簡易ラベル（例: 2024年度（2024年8月〜2025年7月））
  return `${fy}年度（${fy}年8月〜${fy + 1}年7月）`;
}

/** APIレスポンスを柔軟に正規化して FY グループにする */
function normalizeToGroups(json: any): Group[] {
  // 1) fiscal_years / groups 形式を優先
  const srcGroups: any[] = json?.fiscal_years || json?.groups;
  if (Array.isArray(srcGroups)) {
    const out: Group[] = [];
    for (const g of srcGroups) {
      const fy: number =
        Number(g.fy) ||
        Number(g.fiscal_year) ||
        (Array.isArray(g.months) && g.months.length
          ? monthToFY(normalizeMonthString(g.months[0]) || '1970-08-01')
          : 0);
      const items = (g.months || g.items || []) as MonthSummaryAny[];
      const months = items
        .map((r) => {
          const monthDate = normalizeMonthString(r);
          if (!monthDate) return null;
          const ym = monthDate.slice(0, 7);
          const debit =
            toNum(r.debit_total) ||
            toNum(r.debit) ||
            toNum(r.dr_total) ||
            toNum(r.sum_debit);
          const credit =
            toNum(r.credit_total) ||
            toNum(r.credit) ||
            toNum(r.cr_total) ||
            toNum(r.sum_credit);
          const count =
            Number(r.entry_count) ||
            Number(r.count) ||
            Number(r.rows) ||
            0;
          return { ym, monthDate, debit, credit, count };
        })
        .filter(Boolean) as Group['months'];
      out.push({
        fy,
        label: String(g.label || fyLabel(fy)),
        months,
      });
    }
    return out;
  }

  // 2) months / rows / 配列だけ の場合 → FYでグループ化
  const rows: MonthSummaryAny[] =
    json?.months || json?.rows || (Array.isArray(json) ? json : []);
  const groupsMap = new Map<number, Group>();
  for (const r of rows) {
    const monthDate = normalizeMonthString(r);
    if (!monthDate) continue;
    const ym = monthDate.slice(0, 7);
    const fy = monthToFY(monthDate);
    const g =
      groupsMap.get(fy) ||
      ({ fy, label: fyLabel(fy), months: [] } as Group);
    const debit =
      toNum(r.debit_total) ||
      toNum(r.debit) ||
      toNum(r.dr_total) ||
      toNum(r.sum_debit);
    const credit =
      toNum(r.credit_total) ||
      toNum(r.credit) ||
      toNum(r.cr_total) ||
      toNum(r.sum_credit);
    const count =
      Number(r.entry_count) || Number(r.count) || Number(r.rows) || 0;

    g.months.push({ ym, monthDate, debit, credit, count });
    groupsMap.set(fy, g);
  }

  return Array.from(groupsMap.values()).sort((a, b) => b.fy - a.fy);
}

// ===== API フェッチ（候補複数） =====
const ENDPOINTS = [
  '/api/finance/general-ledger/summary',
  '/api/finance/general-ledger/months',
  '/api/general-ledger/summary',
  '/api/general-ledger/months',
];

async function fetchGroups(): Promise<Group[]> {
  let lastErr = '';
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        lastErr = `${res.status} ${res.statusText}`;
        continue;
      }
      const json = await res.json();
      const groups = normalizeToGroups(json);
      if (groups.length) return groups;
    } catch (e: any) {
      lastErr = String(e?.message ?? e);
      continue;
    }
  }
  throw new Error(
    lastErr || '集計データの取得に失敗しました。（APIエンドポイント未検出）'
  );
}

// ===== 画面本体 =====
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
    return () => {
      alive = false;
    };
  }, []);

  const empty = !loading && groups.every((g) => g.months.length === 0);

  return (
    <div>
      {loading && <p style={{ padding: 8 }}>読み込み中…</p>}
      {error && (
        <p style={{ padding: 8, color: '#b91c1c' }}>
          取得エラー: {error}
        </p>
      )}
      {empty && (
        <p style={{ padding: 8, color: '#374151' }}>
          表示できる月次データがありません。
        </p>
      )}

      {/* グループごとに表示 */}
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
            {g.months
              .slice()
              .sort((a, b) => (a.ym < b.ym ? -1 : 1))
              .map((m) => (
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
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: 6,
                        fontSize: 15,
                      }}
                    >
                      {m.ym}
                    </div>
                    <div style={{ color: '#374151', fontSize: 13 }}>
                      仕訳件数: {m.count}　/　借方合計: {YEN(m.debit)}　/　貸方合計: {YEN(m.credit)}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      justifySelf: 'end',
                      flexWrap: 'wrap',
                    }}
                  >
                    <Link
                      href={`/finance/general-ledger-detail?month=${m.monthDate}`}
                      style={btn()}
                    >
                      $ 財務諸表
                    </Link>
                    {/* 必要なら削除APIに合わせて有効化
                    <button
                      onClick={() => onDelete(m.monthDate)}
                      style={btn()}
                    >
                      🗑 削除
                    </button>
                    */}
                  </div>
                </article>
              ))}
            {g.months.length === 0 && (
              <div style={{ color: '#6b7280' }}>この年度のデータはありません</div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

// ===== 付属UI =====
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
