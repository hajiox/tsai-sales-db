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
  const g
