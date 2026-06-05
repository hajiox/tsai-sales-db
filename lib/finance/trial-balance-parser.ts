import { parse as parseCsv } from 'csv-parse/sync';

export type TrialBalanceStatementType = 'bs' | 'pl';

export interface ParsedTrialBalanceRow {
  statementType: TrialBalanceStatementType;
  accountCode: string;
  accountName: string;
  openingBalance: number;
  debitAmount: number;
  creditAmount: number;
  closingBalance: number;
  ratio: number | null;
  rowNo: number;
  isSummary: boolean;
}

export interface ParsedTrialBalance {
  reportMonth: string | null;
  companyName: string | null;
  periodLabel: string | null;
  rows: ParsedTrialBalanceRow[];
  bsRowCount: number;
  plRowCount: number;
}

function compact(value: string) {
  return value.replace(/\s+/g, '');
}

function parseNumber(value: unknown) {
  const normalized = String(value ?? '')
    .replace(/[,\s円￥]/g, '')
    .replace(/[▲△]/g, '-')
    .trim();

  if (!normalized || normalized === '-' || normalized === '－') return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRatio(value: unknown) {
  const normalized = String(value ?? '')
    .replace(/[%％\s]/g, '')
    .trim();
  if (!normalized || normalized === '-' || normalized === '－') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseReiwaDate(text: string) {
  const match = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
  if (!match) return null;
  const year = 2018 + Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function isAccountCode(value: unknown) {
  return /^\d+$/.test(String(value ?? '').trim());
}

function isSummaryRow(code: string, name: string) {
  const numericCode = Number(code);
  return numericCode >= 9000 || /^（.*）$/.test(name) || name.endsWith('の部');
}

export function parseTrialBalanceText(text: string): ParsedTrialBalance {
  const records = parseCsv(text, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as string[][];

  let statementType: TrialBalanceStatementType | null = null;
  let reportMonth: string | null = null;
  let companyName: string | null = null;
  let periodLabel: string | null = null;
  let rowNo = 0;
  let inDataSection = false;

  const rows: ParsedTrialBalanceRow[] = [];

  for (const record of records) {
    const first = String(record[0] ?? '').trim();
    const joined = record.join(' ');
    const joinedCompact = compact(joined);

    if (!first && record.every((cell) => !String(cell ?? '').trim())) continue;

    if (joinedCompact.includes('貸借対照表')) {
      statementType = 'bs';
      inDataSection = false;
      continue;
    }
    if (joinedCompact.includes('損益計算書')) {
      statementType = 'pl';
      inDataSection = false;
      continue;
    }

    const dateMonth = parseReiwaDate(joined);
    if (dateMonth) {
      reportMonth = dateMonth;
      periodLabel = joined.replace(/\s+/g, ' ').trim();
    }

    if (!companyName && first.includes('株式会社')) {
      companyName = first.replace(/\s+/g, ' ').trim();
    }

    if (first.includes('勘定科目コード')) {
      inDataSection = true;
      continue;
    }
    if (!statementType || !inDataSection || !isAccountCode(first)) continue;

    rowNo += 1;
    const accountCode = first;
    const accountName = String(record[1] ?? '').trim();

    rows.push({
      statementType,
      accountCode,
      accountName,
      openingBalance: parseNumber(record[2]),
      debitAmount: parseNumber(record[3]),
      creditAmount: parseNumber(record[4]),
      closingBalance: parseNumber(record[5]),
      ratio: parseRatio(record[6]),
      rowNo,
      isSummary: isSummaryRow(accountCode, accountName),
    });
  }

  return {
    reportMonth,
    companyName,
    periodLabel,
    rows,
    bsRowCount: rows.filter((row) => row.statementType === 'bs').length,
    plRowCount: rows.filter((row) => row.statementType === 'pl').length,
  };
}

export function normalizeReportMonth(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}
