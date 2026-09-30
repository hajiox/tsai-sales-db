import { createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { getFinancePool } from '@/lib/finance/pg';
import { parseFinancialStatementText } from '@/lib/finance/financial-statement-parser';
import { extractFinancialStatementPdfText } from '@/lib/finance/financial-statement-pdf-text';
import { parseClosingPackage, CLOSING_PACKAGE_VERSION, MAX_CLOSING_PDF_SIZE, CLOSING_UPLOAD_CHUNK_SIZE, type ParsedClosingPackage } from '@/lib/finance/closing-package';
import type { ParsedFinancialStatement } from '@/lib/finance/financial-statement-parser';
import { closingChunkExpectedSize, assembleClosingChunks } from '@/lib/finance/closing-package-chunks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_PDF_SIZE = MAX_CLOSING_PDF_SIZE;
const PARSER_VERSION = CLOSING_PACKAGE_VERSION;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  income_before_taxes: { label: '税引前当期純利益', category: 'pl' },
  income_taxes: { label: '法人税・住民税及び事業税', category: 'pl' },
  depreciation_total: { label: '減価償却費合計', category: 'pl' },
  depreciation_expense: { label: '減価償却費', category: 'pl' },
  lease_depreciation_expense: { label: 'リース資産償却費', category: 'pl' },
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

async function isAuthenticated(request: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get('finance-auth')?.value !== 'authenticated') return false;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  return String(token?.email || '').toLowerCase() === 'aizubrandhall@gmail.com';
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function supplementalMetadata(value: unknown): Record<string, unknown> {
  const metadata = asJsonObject(value);
  if (metadata.extraction === 'single_labelled_amount' || metadata.extraction === 'unassigned_numeric_candidates') {
    return { ...metadata, sourceUnit: metadata.unit ?? null, sourceStatus: metadata.status ?? null,
      unit: null, status: 'needs_review' };
  }
  return metadata;
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
    primaryDocumentId: row.primary_document_id ? String(row.primary_document_id) : null,
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
  if (!(await isAuthenticated(request))) return jsonError('財務分析へのログインが必要です', 401);

  const pool = getFinancePool();
  const client = await pool.connect();
  try {
    const documentId = request.nextUrl.searchParams.get('documentId');
    if (documentId && !UUID_RE.test(documentId)) return jsonError('資料IDが不正です', 400);
    if (documentId && request.nextUrl.searchParams.get('download') === '1') {
      const result = await client.query('select file_name, pdf_bytes from public.financial_statement_documents where id = $1::uuid', [documentId]);
      if (!result.rows.length) return jsonError('決算資料が見つかりません', 404);
      if (!result.rows[0].pdf_bytes) return jsonError('旧取込資料の原本は保存されていません。PDFを再取り込みしてください。', 404);
      const name = String(result.rows[0].file_name).replace(/[\r\n\x00-\x1f]/g, '').slice(0, 180);
      const pdf = Buffer.from(result.rows[0].pdf_bytes);
      const chunkParam = request.nextUrl.searchParams.get('chunk');
      let bytes = pdf;
      if (chunkParam !== null) {
        const index = Number(chunkParam);
        const totalChunks = Math.ceil(pdf.length / CLOSING_UPLOAD_CHUNK_SIZE);
        if (!/^\d+$/.test(chunkParam) || !Number.isInteger(index) || index < 0 || index >= totalChunks) return jsonError('ダウンロード分割番号が不正です', 400);
        bytes = pdf.subarray(index * CLOSING_UPLOAD_CHUNK_SIZE, (index + 1) * CLOSING_UPLOAD_CHUNK_SIZE);
      } else if (pdf.length > CLOSING_UPLOAD_CHUNK_SIZE) return jsonError('大きなPDFは画面の原本ダウンロードボタンから取得してください。', 413);
      return new NextResponse(new Uint8Array(bytes), { headers: {
        'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="closing.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Length': String(bytes.length),
      } });
    }
    const uploadsResult = await client.query(
      `select id, company_name, period_number, fiscal_year, period_start, period_end,
              file_name, file_size, page_count, warnings, validation, created_at, primary_document_id
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
    if (requestedId && !UUID_RE.test(requestedId)) return jsonError('決算年度IDが不正です', 400);
    if (requestedId && !periods.some((period: any) => period.id === requestedId)) return jsonError('決算年度が見つかりません', 404);
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

    let documents: any[] = [];
    let pages: any[] = [];
    let records: any[] = [];
    if (selected) {
      const docs = await client.query(
        `select id, upload_id, file_name, file_size, page_count, source_hash, parser_version,
                document_kinds, warnings, validation, created_at, pdf_bytes is not null as original_available
           from public.financial_statement_documents where upload_id = $1::uuid order by created_at`, [selected.id]);
      const primaryId = String(uploadsResult.rows.find((row: any) => String(row.id) === selected.id)?.primary_document_id || '');
      documents = docs.rows.map((row: any) => ({ id: String(row.id), uploadId: String(row.upload_id),
        fileName: row.file_name, fileSize: asNumber(row.file_size), pageCount: asNumber(row.page_count),
        sourceHash: row.source_hash, parserVersion: row.parser_version, documentKinds: row.document_kinds || [],
        warnings: asWarnings(row.warnings), validation: asJsonObject(row.validation),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        isPrimary: String(row.id) === primaryId, originalAvailable: row.original_available === true, hasOriginal: row.original_available === true,
        downloadUrl: row.original_available ? `/api/finance/annual-statements?documentId=${row.id}&download=1` : null, }));
      if (documentId && !documents.some(document => document.id === documentId)) return jsonError('選択年度の資料が見つかりません', 404);
      const ids = documentId ? [documentId] : documents.map(document => document.id);
      if (ids.length) {
        const pageResult = await client.query(
          `select document_id, page_number, document_kind, label, records_count, warnings${documentId ? ', source_text, normalized_text' : ''}
             from public.financial_statement_document_pages where document_id = any($1::uuid[]) order by document_id, page_number`, [ids]);
        pages = pageResult.rows.map((row: any) => ({ documentId: String(row.document_id), pageNumber: row.page_number,
          kind: row.document_kind, label: row.label, recordsCount: row.records_count, warnings: asWarnings(row.warnings),
          ...(documentId ? { text: row.normalized_text, rawText: row.source_text } : {}), }));
        const recordResult = await client.query(
          `select id, document_id, page_number, row_no, section, account_name, amount, raw_text, metadata
             from public.financial_statement_supplemental_records where document_id = any($1::uuid[])
            order by document_id, page_number, row_no`, [ids]);
        records = recordResult.rows.map((row: any) => ({ id: String(row.id), documentId: String(row.document_id),
          page: row.page_number, rowNo: row.row_no, section: row.section, accountName: row.account_name,
          amount: row.amount == null ? null : asNumber(row.amount), rawText: row.raw_text, metadata: supplementalMetadata(row.metadata), }));
      }
    }
    const coverage = { documents: documents.length, pages: pages.length,
      classifiedPages: pages.filter(page => page.kind !== 'other').length, records: records.length,
      amountRecords: records.filter(record => record.amount !== null).length,
      reviewRecords: records.filter(record => record.metadata.status === 'needs_review').length };
    return NextResponse.json({ ok: true, periods, selected, accounts, documents, pages, records, coverage }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    console.error('[finance/annual-statements GET]', error?.code || 'internal_error');
    if (error?.code === '42P01') {
      return jsonError('決算書保存テーブルが未作成です。DBマイグレーションを適用してください。', 503);
    }
    return jsonError('決算書データの取得に失敗しました', 500);
  } finally {
    client.release();
  }
}

class ClosingInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type ClosingDocumentInput = {
  buffer: Buffer; fileName: string; sourceHash: string;
  parsed: ParsedFinancialStatement; package: ParsedClosingPackage;
};

function sha256(value: Buffer | string) { return createHash('sha256').update(value).digest('hex'); }
function requireUuid(value: unknown, label: string) {
  const id = String(value || '');
  if (!UUID_RE.test(id)) throw new ClosingInputError(`${label}が不正です`);
  return id;
}

async function prepareDocument(buffer: Buffer, fileName: string): Promise<ClosingDocumentInput> {
  if (!buffer.length || buffer.length > MAX_PDF_SIZE) throw new ClosingInputError('PDFは空でなく20MB以下にしてください', 413);
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new ClosingInputError('PDFとして認識できないファイルです', 415);
  const extracted = await extractFinancialStatementPdfText(new Uint8Array(buffer));
  const pack = parseClosingPackage(extracted.pages.map(page => ({ pageNumber: page.number, text: page.text, rawText: page.rawText })));
  return { buffer, fileName: fileName.replace(/[\r\n\x00-\x1f]/g, '').slice(0, 180), sourceHash: sha256(buffer),
    parsed: parseFinancialStatementText(pack.sourceText), package: pack };
}

async function storeDocument(client: DbClient, input: ClosingDocumentInput, periodId: string | null, replacePrimary: boolean) {
  const { parsed, package: pack } = input;
  const warnings = [...new Set([...parsed.warnings, ...pack.warnings])];
  const validation = normalizeValidation(parsed.validation);
  const candidatePrimary = parsed.validation.balanceSheet.passed === true && parsed.validation.incomeStatement.passed === true
    && pack.documentKinds.some(kind => kind.kind === 'balance_sheet') && pack.documentKinds.some(kind => kind.kind === 'income_statement');
  let annual: any;
  if (periodId) {
    const existing = await client.query('select * from public.financial_statement_uploads where id = $1::uuid for update', [periodId]);
    annual = existing.rows[0];
    if (!annual) throw new ClosingInputError('追加先の決算年度が見つかりません', 404);
    if (parsed.companyName && parsed.companyName !== annual.company_name) throw new ClosingInputError('資料の会社名が追加先と一致しません', 422);
    if ((parsed.periodStart && parsed.periodStart !== asIsoDate(annual.period_start)) || (parsed.periodEnd && parsed.periodEnd !== asIsoDate(annual.period_end)))
      throw new ClosingInputError('資料の事業年度が追加先と一致しません', 422);
  } else {
    if (!parsed.companyName || !parsed.periodStart || !parsed.periodEnd) throw new ClosingInputError('会社名・決算期間を判定できません。既存年度を選択して追加してください。', 422);
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`closing:${parsed.companyName}:${parsed.periodStart}:${parsed.periodEnd}`]);
    const result = await client.query(
      `insert into public.financial_statement_uploads
        (company_name, period_number, fiscal_year, period_start, period_end, file_name, file_size,
         page_count, source_hash, parser_version, source_text, warnings, validation)
       values ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)
       on conflict (company_name, period_start, period_end) do nothing returning *`,
      [parsed.companyName, parsed.periodNumber, Number(parsed.periodEnd.slice(0, 4)), parsed.periodStart, parsed.periodEnd,
        input.fileName, input.buffer.length, pack.pages.length, input.sourceHash, PARSER_VERSION, pack.sourceText,
        JSON.stringify(warnings), JSON.stringify(validation)]);
    annual = result.rows[0] || (await client.query(
      'select * from public.financial_statement_uploads where company_name=$1 and period_start=$2::date and period_end=$3::date for update',
      [parsed.companyName, parsed.periodStart, parsed.periodEnd])).rows[0];
  }
  const uploadId = String(annual.id);
  const existingDoc = (await client.query(
    'select id, pdf_bytes is not null as original_available from public.financial_statement_documents where upload_id=$1::uuid and source_hash=$2 for update', [uploadId, input.sourceHash])).rows[0];
  const duplicate = existingDoc?.original_available === true;
  let documentId = existingDoc ? String(existingDoc.id) : '';
  if (!duplicate) {
    const values = [uploadId, input.fileName, input.buffer.length, pack.pages.length, input.sourceHash, PARSER_VERSION,
      input.buffer, pack.sourceText, JSON.stringify(pack.documentKinds), JSON.stringify(warnings),
      JSON.stringify({ ...validation, candidatePrimary }), JSON.stringify({ accounts: parsed.accounts, metrics: parsed.metrics, rawValidation: parsed.validation })];
    const doc = await client.query(
      `insert into public.financial_statement_documents
        (upload_id,file_name,file_size,page_count,source_hash,parser_version,pdf_bytes,source_text,document_kinds,warnings,validation,parsed_snapshot)
       values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb)
       on conflict (upload_id,source_hash) do update set pdf_bytes=excluded.pdf_bytes, file_size=excluded.file_size,
         page_count=excluded.page_count, parser_version=excluded.parser_version, source_text=excluded.source_text,
         document_kinds=excluded.document_kinds,warnings=excluded.warnings,validation=excluded.validation,parsed_snapshot=excluded.parsed_snapshot
       returning id`, values);
    documentId = String(doc.rows[0].id);
    for (const page of pack.pages) {
      await client.query(
        `insert into public.financial_statement_document_pages
          (document_id,page_number,document_kind,label,source_text,normalized_text,records_count,warnings)
         values ($1::uuid,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [documentId, page.pageNumber, page.kind, page.label, page.rawText ?? page.text, page.text, page.recordsCount, JSON.stringify(page.warnings)]);
    }
    for (let offset = 0; offset < pack.records.length; offset += 150) {
      const batch = pack.records.slice(offset, offset + 150);
      const recordValues: unknown[] = [];
      const places = batch.map((record, index) => {
        recordValues.push(documentId, record.page, record.rowNo, record.section, record.accountName, record.amount, record.rawText, JSON.stringify(record.metadata));
        return `($${index * 8 + 1}::uuid,$${index * 8 + 2},$${index * 8 + 3},$${index * 8 + 4},$${index * 8 + 5},$${index * 8 + 6},$${index * 8 + 7},$${index * 8 + 8}::jsonb)`;
      });
      await client.query(`insert into public.financial_statement_supplemental_records
        (document_id,page_number,row_no,section,account_name,amount,raw_text,metadata) values ${places.join(',')}`, recordValues);
    }
  }
  const accounts = normalizeAccounts(parsed.accounts);
  const metrics = normalizeMetrics(parsed.metrics as unknown as Record<string, unknown>);
  let primaryUpdated = false;
  if (candidatePrimary && (!annual.primary_document_id || (String(annual.primary_document_id) === documentId && !duplicate) || replacePrimary)) {
    await client.query('delete from public.financial_statement_accounts where upload_id=$1::uuid', [uploadId]);
    await client.query('delete from public.financial_statement_metrics where upload_id=$1::uuid', [uploadId]);
    await insertAccounts(client, uploadId, accounts);
    await insertMetrics(client, uploadId, metrics);
    await client.query(`update public.financial_statement_uploads set primary_document_id=$2::uuid,period_number=coalesce($3,period_number),
      file_name=$4,file_size=$5,page_count=$6,source_hash=$7,parser_version=$8,source_text=$9,warnings=$10::jsonb,validation=$11::jsonb,updated_at=now() where id=$1::uuid`,
      [uploadId,documentId,parsed.periodNumber,input.fileName,input.buffer.length,pack.pages.length,input.sourceHash,PARSER_VERSION,pack.sourceText,JSON.stringify(warnings),JSON.stringify(validation)]);
    primaryUpdated = true;
  } else if (candidatePrimary && String(annual.primary_document_id) !== documentId) {
    warnings.push('同年度の検算済み決算書が既にあります。今回の別原本は追加保存し、年次指標は変更していません。');
  } else if (!candidatePrimary) {
    warnings.push('正式な貸借対照表・損益計算書の検算が揃わないため、全ページと資料明細を保存し、年次確定指標には反映していません。');
  }
  return { statement: { id: uploadId, companyName: annual.company_name, periodNumber: parsed.periodNumber ?? annual.period_number,
      periodStart: asIsoDate(annual.period_start), periodEnd: asIsoDate(annual.period_end) },
    documentId, duplicate, primaryUpdated, warnings, validation,
    stats: { documents: 1, pages: pack.pages.length, accounts: primaryUpdated ? accounts.length : 0,
      metrics: primaryUpdated ? metrics.length : 0, records: pack.records.length, warnings: warnings.length } };
}

async function sessionForToken(client: DbClient, id: unknown, token: unknown, lock = false) {
  const sessionId = requireUuid(id, 'アップロードID');
  const sessionToken = String(token || '');
  if (!/^[0-9a-f]{64}$/.test(sessionToken)) throw new ClosingInputError('アップロード認証が不正です', 403);
  const result = await client.query(`select * from public.financial_statement_upload_sessions where id=$1::uuid and token_hash=$2 and expires_at>now()${lock ? ' for update' : ''}`, [sessionId,sha256(sessionToken)]);
  if (!result.rows.length) throw new ClosingInputError('アップロードが期限切れ、完了済み、または認証が不正です', 410);
  return result.rows[0];
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated(request))) return jsonError('財務分析へのログインが必要です', 401);
  const pool = getFinancePool();
  let client: DbClient | null = null;
  try {
    const isJson = request.headers.get('content-type')?.includes('application/json');
    const body = isJson ? await request.json() : null;
    const form = isJson ? null : await request.formData();
    const action = String(body?.action || form?.get('action') || 'import');
    client = await pool.connect();
    if (action === 'beginUpload') {
      const fileSize = Number(body?.fileSize);
      const sourceHash = String(body?.sourceHash || '');
      const fileName = String(body?.fileName || '').replace(/[\r\n\x00-\x1f]/g, '').slice(0,180);
      if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_PDF_SIZE) throw new ClosingInputError('PDFは空でなく20MB以下にしてください', 413);
      if (!/^[0-9a-f]{64}$/.test(sourceHash) || !fileName.toLowerCase().endsWith('.pdf')) throw new ClosingInputError('PDF名またはハッシュが不正です');
      const periodId = body?.periodId ? requireUuid(body.periodId, '決算年度ID') : null;
      if (periodId && !(await client.query('select id from public.financial_statement_uploads where id=$1::uuid',[periodId])).rows.length) throw new ClosingInputError('決算年度が見つかりません',404);
      await client.query('delete from public.financial_statement_upload_sessions where expires_at < now()');
      const pending = await client.query('select count(*)::integer as count from public.financial_statement_upload_sessions');
      if (pending.rows[0].count >= 20) throw new ClosingInputError('未完了アップロードが多いため、時間を置いて再試行してください',429);
      const token = randomBytes(32).toString('hex');
      const totalChunks = Math.ceil(fileSize / CLOSING_UPLOAD_CHUNK_SIZE);
      const created = await client.query(`insert into public.financial_statement_upload_sessions
        (token_hash,file_name,file_size,source_hash,total_chunks,period_id) values ($1,$2,$3,$4,$5,$6::uuid) returning id`,
        [sha256(token),fileName,fileSize,sourceHash,totalChunks,periodId]);
      return NextResponse.json({ok:true,uploadSessionId:String(created.rows[0].id),uploadToken:token,chunkSize:CLOSING_UPLOAD_CHUNK_SIZE,totalChunks}, {headers:{'Cache-Control':'no-store'}});
    }
    if (action === 'uploadChunk') {
      const chunk = form?.get('file');
      if (!(chunk instanceof File) || !chunk.size || chunk.size>CLOSING_UPLOAD_CHUNK_SIZE) throw new ClosingInputError('PDF分割データは2MB以下にしてください',413);
      await client.query('begin');
      const session = await sessionForToken(client,form?.get('uploadSessionId'),form?.get('uploadToken'),true);
      const index = Number(form?.get('chunkIndex'));
      if (!Number.isInteger(index) || index<0 || index>=session.total_chunks) throw new ClosingInputError('分割番号が不正です');
      const expectedSize = closingChunkExpectedSize(session.file_size,CLOSING_UPLOAD_CHUNK_SIZE,index);
      if (chunk.size!==expectedSize) throw new ClosingInputError('分割データのサイズが一致しません');
      const bytes = Buffer.from(await chunk.arrayBuffer());
      const hash = sha256(bytes);
      const existing = await client.query('select chunk_hash from public.financial_statement_upload_chunks where session_id=$1::uuid and chunk_index=$2',[session.id,index]);
      if (existing.rows.length && existing.rows[0].chunk_hash!==hash) throw new ClosingInputError('同じ分割番号に異なるデータが届きました',409);
      await client.query(`insert into public.financial_statement_upload_chunks (session_id,chunk_index,chunk_bytes,chunk_hash)
        values ($1::uuid,$2,$3,$4) on conflict (session_id,chunk_index) do nothing`,[session.id,index,bytes,hash]);
      await client.query('commit');
      return NextResponse.json({ok:true,received:index});
    }
    let inputs: ClosingDocumentInput[];
    let periodId = body?.periodId || form?.get('periodId') ? requireUuid(body?.periodId || form?.get('periodId'),'決算年度ID') : null;
    const replacePrimary = body?.replacePrimary === true || form?.get('replacePrimary') === 'true';
    let session: any = null;
    if (action === 'completeUpload') {
      session = await sessionForToken(client,body?.uploadSessionId,body?.uploadToken);
      if (periodId && session.period_id && periodId!==String(session.period_id)) throw new ClosingInputError('アップロード開始時の決算年度と一致しません');
      periodId ||= session.period_id ? String(session.period_id) : null;
      const chunks = await client.query('select chunk_index,chunk_bytes,chunk_hash from public.financial_statement_upload_chunks where session_id=$1::uuid order by chunk_index',[session.id]);
      let bytes:Buffer;
      try { bytes=assembleClosingChunks(chunks.rows.map((row:any)=>({index:row.chunk_index,bytes:row.chunk_bytes,hash:row.chunk_hash})),
        session.file_size,session.source_hash,CLOSING_UPLOAD_CHUNK_SIZE); }
      catch(error) { throw new ClosingInputError(error instanceof Error ? error.message : 'PDF分割データが不一致です',422); }
      inputs=[await prepareDocument(bytes,session.file_name)];
    } else if (action === 'import') {
      const files = [...(form?.getAll('files') || []), ...(form?.get('file') ? [form.get('file')] : [])].filter((file):file is File=>file instanceof File);
      if (!files.length || files.length>10) throw new ClosingInputError('PDFファイルを1〜10件選択してください');
      if (files.reduce((sum,file)=>sum+file.size,0)>MAX_PDF_SIZE) throw new ClosingInputError('直接アップロードは合計20MB以下にしてください',413);
      inputs=[];
      for (const file of files) inputs.push(await prepareDocument(Buffer.from(await file.arrayBuffer()),file.name));
    } else throw new ClosingInputError('アップロード操作が不正です');
    await client.query('begin');
    if (session) await sessionForToken(client,session.id,body?.uploadToken,true);
    const results=[];
    for (const input of inputs) results.push(await storeDocument(client,input,periodId,replacePrimary));
    if (session) await client.query('delete from public.financial_statement_upload_sessions where id=$1::uuid',[session.id]);
    await client.query('commit');
    const first=results[0];
    return NextResponse.json({ok:true,...first,results,stats:results.reduce((total,item)=>({documents:total.documents+1,pages:total.pages+item.stats.pages,
      accounts:total.accounts+item.stats.accounts,metrics:total.metrics+item.stats.metrics,records:total.records+item.stats.records,warnings:total.warnings+item.stats.warnings}),
      {documents:0,pages:0,accounts:0,metrics:0,records:0,warnings:0})}, {headers:{'Cache-Control':'no-store'}});
  } catch (error:any) {
    if (client) await client.query('rollback').catch(()=>undefined);
    console.error('[finance/annual-statements POST]', error?.code || (error instanceof ClosingInputError ? 'invalid_input' : 'internal_error'));
    if (error instanceof ClosingInputError) return jsonError(error.message,error.status);
    if (error?.code==='42P01' || error?.code==='42703') return jsonError('決算資料保存テーブルが未更新です。DBマイグレーションを適用してください。',503);
    return jsonError('決算資料PDFの取込に失敗しました。読み取り可能なPDFか確認してください。',500);
  } finally { client?.release(); }
}
