// app/finance/general-ledger/ClientGL.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// ===== 型（ゆるめ） =====
type MonthSummaryAny = Record<string, unknown>;
type Group = {
  fy: number; // 例: 2024（8月始まり: 2024/08〜2025/07）
  label: string;
  months: Array<{
    ym: string; // 'YYYY-MM'
    monthDate: string; // 'YYYY-MM-01'
    debit: number;
    credit: number;
    count: number;
  }>;
};

// ===== ユーティリティ =====
const YEN = (n: number) => `¥ ${Number(n || 0).toLocaleString()}`;

function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = v.replace(/[¥,\s\u3000]/g, '').trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** 文字列から 'YYYY-MM-01' を作る（幅広い表記に対応） */
function parseMonthStr(s: string): string | null {
  const t = s.trim();

  // 1) 202505 or 20250531
  const mNum = t.match(/^(\d{4})(\d{1,2})(\d{2})?$/);
  if (mNum) {
    const y = mNum[1];
    const mm = mNum[2].padStart(2, '0');
    return `${y}-${mm}-01`;
  }

  // 2) 2025-05, 2025-5, 2025/05, 2025/5
  const mYMD1 = t.match(/^(\d{4})[-/](\d{1,2})$/);
  if (mYMD1) {
    const y = mYMD1[1];
    const mm = mYMD1[2].padStart(2, '0');
    return `${y}-${mm}-01`;
  }

  // 3) 2025-05-01, 2025-5-1, 2025/05/31 など
  const mYMD2 = t.match(/^(\d{4})[-/](\d{1,2})[-/]\d{1,2}$/);
  if (mYMD2) {
    const y = mYMD2[1];
    const mm = mYMD2[2].padStart(2, '0');
    return `${y}-${mm}-01`;
  }

  return null;
}

/** { ... } の中から月情報候補を拾って正規化 */
function normalizeMonthString(o: MonthSummaryAny): string | null {
  const cand = [
    o.target_month,
    o.month,
    o.ym,
    o.yyyymm,
    o.yyyymmdd,
    o.month_date,
    o.date,
    o.period,
    o.fiscal_month,
    o.fy_month,
    o.month_str,
  ] as Array<unknown>;

  for (const c of cand) {
    if (!c) continue;
    const v = String(c);
    const norm = parseMonthStr(v);
    if (norm) return norm;
  }
  return null;
}

/** 月→会計年度（8月開始） */
function monthToFY(monthDate: string): number {
  const [y, m] = monthDate.split('-').map((x) => Number(x));
  return m >= 8 ? y : y - 1;
}
function fyLabel(fy: number): string {
  return `${fy}年度（${fy}年8月〜${fy + 1}年7月）`;
}

/** そのFYの12ヶ月スケルトンを補完（欠けている月を0で埋める） */
function fillSkeletonMonths(fy: number, months: Group['months']): Group['months'] {
  const set = new Map(months.map((m) => [m.ym, m]));
  for (let i = 0; i < 12; i++) {
    const d = new Date(fy, 7 + i, 1); // 8月=7
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!set.has(ym)) {
      set.set(ym, {
        ym,
        monthDate: `${ym}-01`,
        debit: 0,
        credit: 0,
        count: 0,
      });
    }
  }
  return Array.from(set.values()).sort((a, b) => (a.ym < b.ym ? -1 : 1));
}

// ===== 正規化 =====
function normalizeToGroups(json: any): Group[] {
  // 1) fiscal_years / groups 形式
  const srcGroups: any[] = json?.fiscal_years || json?.groups;
  if (Array.isArray(srcGroups)) {
    const out: Group[] = [];
    for (const g of srcGroups) {
      const items = (g.months || g.items || []) as MonthSummaryAny[];
      const sampleMonth =
        items.find((r) => normalizeMonthString(r)) || ({} as MonthSummaryAny);
      const fy: number =
        Number(g.fy) ||
        Number(g.fiscal_year) ||
        monthToFY(normalizeMonthString(sampleMonth) || '1970-08-01');

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
        months: fillSkeletonMonths(fy, months), // ← スケルトン補完
      });
    }
    return out.sort((a, b) => b.fy - a.fy);
  }

  // 2) months / rows / 配列 → FYでグループ化
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
  // FYごとにスケルトン補完
  return Array.from(groupsMap.values())
    .map((g) => ({
      ...g,
      months: fillSkeletonMonths(g.fy, g.months),
    }))
    .sort((a, b) => b.fy - a.fy);
}

// ===== API 候補 =====
const ENDPOINTS = [
  '/api/finance/general-ledger',
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
  throw new Error(lastErr || '集計データの取得に失敗しました。（APIエンドポイント未検出）');
}

// ===== リフレッシュ候補（どれかが当たればOK） =====
const REFRESH_ENDPOINTS = [
  '/api/finance/refresh',
  '/api/finance/general-ledger/refresh',
  '/api/general-ledger/refresh',
  '/api/finance/gl/refresh',
];

async function tryRefresh(): Promise<boolean> {
  for (const url of REFRESH_ENDPOINTS) {
    try {
      const r = await fetch(url, { method: 'POST' });
      if (r.ok) return true;
    } catch {
      /* noop */
    }
  }
  return false;
}

// ===== 画面本体 =====
export default function ClientGL() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState(false); // 更新中UI

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const g = await fetchGroups();
      setGroups(g);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const refreshAndReload = async () => {
    try {
      setBusy(true);
      await tryRefresh(); // 失敗しても続行（スケルトン補完で月は出る）
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const empty = !loading && groups.every((g) => g.months.length === 0);

  return (
    <div>
      {/* 操作バー */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={load} style={btn()} disabled={loading || busy}>
          最新を再取得
        </button>
        <button onClick={refreshAndReload} style={btn()} disabled={busy}>
          マテビュー更新 → 再取得
        </button>
      </div>

      {busy && <p style={{ padding: 6 }}>更新中…</p>}
      {loading && <p style={{ padding: 6 }}>読み込み中…</p>}
      {error && <p style={{ padding: 6, color: '#b91c1c' }}>取得エラー: {error}</p>}
      {empty && <p style={{ padding: 6, color: '#374151' }}>表示できる月次データがありません。</p>}

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
