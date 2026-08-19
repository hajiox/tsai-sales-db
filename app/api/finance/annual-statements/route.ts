import { createHash } from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import type { PoolClient } from 'pg';
import { getFinancePool } from '@/lib/finance/pg';
import { parseFinancialStatementText } from '@/lib/finance/financial-statement-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_PDF_SIZE = 20 * 1024 * 1024;
const PARSER_VERSION = 'financial-statement-v1';

type DbClient = PoolClient;

type NormalizedAccount = {
  statementType: 'bs' | 'pl' | 'sga' | 'equity' | 'notes';
  section: string | null;
  accountName: string;
  amount: number | null;
  rowNo: number;
  metadata: Record<string, unknown>;
};

type NormalizedMetric = {
  metricKey: string;
  label: string;
  category: string;
  amount: number;
  metadata: Record<string, unknown>;
};

const METRIC_DEFINITIONS: Record<string, { label: string; category: string }> = {
  cash_and_deposits: { label: '現金及び預金', category: 'bs' },
  accounts_receivable: { label: '売掛金', category: 'bs' },
  inventory: { label: '棚卸資産', category: 'inventory' },
  accounts_payable: { label: '買掛金', category: 'bs' },
  short_term_borrowings: { label: '短期借入金', category: 'borrowings' },
  long_term_borrowings: { label: '長期借入金', category: 'borrowings' },
  lease_obligations: { label: 'リース債務', category: 'borrowings' },
  total_borrowings: { label: '借入金合計', category: 'borrowings' },
  total_assets: { label: '総資産', category: 'bs' },
  total_liabilities: { label: '負債合計', category: 'bs' },
  net_assets: { label: '純資産', category: 'bs' },
  beginning_inventory: { label: '期首棚卸高', category: 'inventory' },
  purchases: { label: '仕入高', category: 'pl' },
  ending_inventory: { label: '期末棚卸高', category: 'inventory' },
  inventory_change: { label: '棚卸資産増減', category: 'inventory' },
  cogs: { label: '売上原価', category: 'pl' },
  net_sales: { label: '売上高', category: 'pl' },
  gross_profit: { label: '売上総利益', category: 'pl' },
  sga: { label: '販売費及び一般管理費', category: 'pl' },
  operating_income: { label: '営業利益', category: 'pl' },
  ordinary_income: { label: '経常利益', category: 'pl' },
  pretax_income: { label: '税引前当期純利益', category: 'pl' },
  net_income: { label: '当期純利益', category: 'pl' },
  interest_expense: { label: '支払利息', category: 'pl' },
};

function normalizeAccounts(parsedAccounts: any): NormalizedAccount[] {
  const groups: Array<[NormalizedAccount['statementType'], any[]]> = [
    ['bs', parsedAccounts?.balanceSheet || []],
    ['pl', parsedAccounts?.incomeStatement || []],
    ['sga', parsedAccounts?.sellingGeneralAdministrative || []],
    ['equity', parsedAccounts?.equityChanges || []],
    ['notes', parsedAccounts?.notes || []],
  ];
  const rows: NormalizedAccount[] = [];
  for (const [statementType, accounts] of groups) {
    accounts.forEach((account, index) => {
      rows.push({
        statementType,
        section: account.section || account.category || null,
        accountName: String(account.accountName || account.rawText || '名称未取得'),
        amount: account.amount == null || !Number.isFinite(Number(account.amount)) ? null : Number(account.amount),
        rowNo: index + 1,
        metadata: {
          normalizedAccountName: account.normalizedAccountName || null,
          amounts: Array.isArray(account.amounts) ? account.amounts : [],
          page: account.page || null,
          rawText: account.rawText || null,
          category: account.category || null,
          side: account.side || null,
          isTotal: Boolean(account.isTotal),
          isDerived: Boolean(account.isDerived),
        },
      });
    });
  }
  return rows;
}

function normalizeMetrics(parsedMetrics: Record<string, unknown>): NormalizedMetric[] {
  return Object.entries(parsedMetrics || {}).flatMap(([metricKey, rawAmount]) => {
    if (rawAmount == null || !Number.isFinite(Number(rawAmount))) return [];
    const definition = METRIC_DEFINITIONS[metricKey] || { label: metricKey, category: 'other' };
    return [{
      metricKey,
      label: definition.label,
      category: definition.category,
      amount: Number(rawAmount),
      metadata: {},
    }];
  });
}

function normalizeValidation(validation: any) {
  return {
    balanceSheetBalanced: validation?.balanceSheet?.passed === true,
    balanceSheetDifference: asNumber(validation?.balanceSheet?.difference),
    profitLossCalculated: validation?.incomeStatement?.passed === true,
    checks: validation?.incomeStatement?.checks || [],
    raw: validation || {},
  };
}

function jsonError(error: string, status: number, detail?: unknown) {
  return NextResponse.json({ ok: false, error, detail }, { status });
}

async function isAuthenticated() {
  const cookieStore = await cookies();
  return cookieStore.get('finance-auth')?.value === 'authenticated';
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function asWarnings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : [];
}

function asIsoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }
  const text = String(value || '');
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] || text.slice(0, 10);
}

async function insertAccounts(
  client: DbClient,
  uploadId: string,
  accounts: NormalizedAccount[],
) {
  for (let offset = 0; offset < accounts.length; offset += 250) {
    const batch = accounts.slice(offset, offset + 250);
    const values: unknown[] = [];
    const placeholders = batch.map((account, index) => {
      const base = index * 7;
      values.push(
        uploadId,
        account.statementType,
        account.section || null,
        account.accountName,
        account.amount ?? null,
        account.rowNo,
        JSON.stringify(account.metadata || {}),
      );
      return `($${base + 1}::uuid, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}::jsonb)`;
    });
    await client.query(
      `insert into public.financial_statement_accounts
        (upload_id, statement_type, section, account_name, amount, row_no, metadata)
       values ${placeholders.join(', ')}`,
      values,
    );
  }
}

async function insertMetrics(
  client: DbClient,
  uploadId: string,
  metrics: NormalizedMetric[],
) {
  for (let offset = 0; offset < metrics.length; offset += 250) {
    const batch = metrics.slice(offset, offset + 250);
    const values: unknown[] = [];
    const placeholders = batch.map((item, index) => {
      const base = index * 6;
      values.push(
        uploadId,
        item.metricKey,
        item.label,
        item.category,
        item.amount,
        JSON.stringify(item.metadata || {}),
      );
      return `($${base + 1}::uuid, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::jsonb)`;
    });
    await client.query(
      `insert into public.financial_statement_metrics
        (upload_id, metric_key, label, category, amount, metadata)
       values ${placeholders.join(', ')}`,
      values,
    );
  }
}

function serializePeriod(row: any, metricsByUpload: Map<string, Record<string, any>>) {
  return {
    id: String(row.id),
    companyName: String(row.company_name || ''),
    periodNumber: row.period_number == null ? null : asNumber(row.period_number),
    fiscalYear: asNumber(row.fiscal_year),
    periodStart: asIsoDate(row.period_start),
    periodEnd: asIsoDate(row.period_end),
    fileName: String(row.file_name || ''),
    fileSize: asNumber(row.file_size),
    pageCount: asNumber(row.page_count),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
    warnings: asWarnings(row.warnings),
    validation: asJsonObject(row.validation),
    metrics: metricsByUpload.get(String(row.id)) || {},
  };
}

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) return jsonError('財務分析へのログインが必要です', 401);

  const pool = getFinancePool();
  const client = await pool.connect();
  try {
    const uploadsResult = await client.query(
      `select id, company_name, period_number, fiscal_year, period_start, period_end,
              file_name, file_size, page_count, warnings, validation, created_at
         from public.financial_statement_uploads
        order by period_end desc, created_at desc`,
    );
    const uploadIds = uploadsResult.rows.map((row: any) => String(row.id));
    const metricsByUpload = new Map<string, Record<string, any>>();

    if (uploadIds.length > 0) {
      const metricsResult = await client.query(
        `select upload_id, metric_key, label, category, amount
           from public.financial_statement_metrics
          where upload_id = any($1::uuid[])
          order by metric_key`,
        [uploadIds],
      );
      for (const row of metricsResult.rows) {
        const uploadId = String(row.upload_id);
        const current = metricsByUpload.get(uploadId) || {};
        current[String(row.metric_key)] = {
          metricKey: String(row.metric_key),
          label: String(row.label),
          category: String(row.category),
          amount: asNumber(row.amount),
        };
        metricsByUpload.set(uploadId, current);
      }
    }

    const periods = uploadsResult.rows.map((row: any) => serializePeriod(row, metricsByUpload));
    const requestedId = request.nextUrl.searchParams.get('id');
    const selected = periods.find((period: any) => period.id === requestedId) || periods[0] || null;
    let accounts: any[] = [];

    if (selected) {
      const accountsResult = await client.query(
        `select id, statement_type, section, account_name, amount, row_no, metadata
           from public.financial_statement_accounts
          where upload_id = $1::uuid
          order by case statement_type
                     when 'bs' then 1 when 'pl' then 2 when 'sga' then 3
                     when 'equity' then 4 else 5 end,
                   row_no`,
        [selected.id],
      );
      accounts = accountsResult.rows.map((row: any) => ({
        id: String(row.id),
        statementType: String(row.statement_type),
        section: row.section == null ? null : String(row.section),
        accountName: String(row.account_name || ''),
        amount: row.amount == null ? null : asNumber(row.amount),
        rowNo: asNumber(row.row_no),
        metadata: asJsonObject(row.metadata),
      }));
    }

    return NextResponse.json({ ok: true, periods, selected, accounts }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    console.error('[finance/annual-statements GET]', error);
    if (error?.code === '42P01') {
      return jsonError('決算書保存テーブルが未作成です。DBマイグレーションを適用してください。', 503);
    }
    return jsonError(error?.message || '決算書データの取得に失敗しました', 500);
  } finally {
    client.release();
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) return jsonError('財務分析へのログインが必要です', 401);

  let parser: PDFParse | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return jsonError('PDFファイルを選択してください', 400);
    if (file.size <= 0) return jsonError('PDFファイルが空です', 400);
    if (file.size > MAX_PDF_SIZE) return jsonError('PDFは20MB以下にしてください', 413);
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return jsonError('PDF形式の決算書を選択してください', 415);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return jsonError('PDFとして認識できないファイルです', 415);
    }

    parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText({
      lineEnforce: true,
      cellSeparator: ' ',
      pageJoiner: '\n===== PAGE page_number =====\n',
    });
    const sourceText = textResult.text.trim();
    if (sourceText.replace(/\s/g, '').length < 80) {
      return jsonError(
        '文字情報を読み取れませんでした。画像だけのスキャンPDFは、OCR済みPDFへ変換してから取り込んでください。',
        422,
      );
    }

    const parsed = parseFinancialStatementText(sourceText);
    const accounts = normalizeAccounts(parsed.accounts);
    const metrics = normalizeMetrics(parsed.metrics as unknown as Record<string, unknown>);
    const validation = normalizeValidation(parsed.validation);
    if (!parsed.companyName || !parsed.periodStart || !parsed.periodEnd) {
      return jsonError('会社名または決算期間を判定できませんでした', 422, parsed.warnings);
    }
    if (accounts.length === 0 || metrics.length === 0) {
      return jsonError('決算書の科目・金額を抽出できませんでした', 422, parsed.warnings);
    }

    const sourceHash = createHash('sha256').update(buffer).digest('hex');
    const fiscalYear = Number(parsed.periodEnd.slice(0, 4));
    const pool = getFinancePool();
    const client = await pool.connect();

    try {
      await client.query('begin');
      const uploadResult = await client.query(
        `insert into public.financial_statement_uploads
          (company_name, period_number, fiscal_year, period_start, period_end,
           file_name, mime_type, file_size, page_count, source_hash, parser_version,
           source_text, warnings, validation, updated_at)
         values ($1, $2, $3, $4::date, $5::date, $6, 'application/pdf', $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, now())
         on conflict (company_name, period_start, period_end) do update
           set period_number = excluded.period_number,
               fiscal_year = excluded.fiscal_year,
               file_name = excluded.file_name,
               mime_type = excluded.mime_type,
               file_size = excluded.file_size,
               page_count = excluded.page_count,
               source_hash = excluded.source_hash,
               parser_version = excluded.parser_version,
               source_text = excluded.source_text,
               warnings = excluded.warnings,
               validation = excluded.validation,
               updated_at = now()
         returning id`,
        [
          parsed.companyName,
          parsed.periodNumber,
          fiscalYear,
          parsed.periodStart,
          parsed.periodEnd,
          file.name,
          buffer.length,
          parsed.pageCount || textResult.total,
          sourceHash,
          PARSER_VERSION,
          sourceText,
          JSON.stringify(parsed.warnings),
          JSON.stringify(validation),
        ],
      );
      const uploadId = String(uploadResult.rows[0].id);

      await client.query('delete from public.financial_statement_accounts where upload_id = $1::uuid', [uploadId]);
      await client.query('delete from public.financial_statement_metrics where upload_id = $1::uuid', [uploadId]);
      await insertAccounts(client, uploadId, accounts);
      await insertMetrics(client, uploadId, metrics);
      await client.query('commit');

      return NextResponse.json({
        ok: true,
        statement: {
          id: uploadId,
          companyName: parsed.companyName,
          periodNumber: parsed.periodNumber,
          periodStart: parsed.periodStart,
          periodEnd: parsed.periodEnd,
        },
        stats: {
          pages: parsed.pageCount || textResult.total,
          accounts: accounts.length,
          metrics: metrics.length,
          warnings: parsed.warnings.length,
        },
        validation,
      });
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[finance/annual-statements POST]', error);
    if (error?.code === '42P01') {
      return jsonError('決算書保存テーブルが未作成です。DBマイグレーションを適用してください。', 503);
    }
    return jsonError(error?.message || '決算書PDFの取込に失敗しました', 500);
  } finally {
    if (parser) await parser.destroy().catch(() => undefined);
  }
}
