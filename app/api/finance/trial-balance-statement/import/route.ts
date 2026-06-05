import { NextRequest, NextResponse } from 'next/server';
import * as iconv from 'iconv-lite';
import { getFinancePool } from '@/lib/finance/pg';
import {
  normalizeReportMonth,
  parseTrialBalanceText,
} from '@/lib/finance/trial-balance-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function countReplacementChars(value: string) {
  return (value.match(/\uFFFD/g) || []).length;
}

function decodeBuffer(buffer: Buffer, requestedEncoding: string | null) {
  if (requestedEncoding === 'utf-8' || requestedEncoding === 'shift_jis') {
    return {
      text: requestedEncoding === 'utf-8'
        ? buffer.toString('utf8')
        : iconv.decode(buffer, 'shift_jis'),
      encoding: requestedEncoding,
    };
  }

  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.toString('utf8'), encoding: 'utf-8' };
  }

  const utf8Text = buffer.toString('utf8');
  const sjisText = iconv.decode(buffer, 'shift_jis');
  const utf8Score = countReplacementChars(utf8Text);
  const sjisScore = countReplacementChars(sjisText);

  if (sjisScore < utf8Score) {
    return { text: sjisText, encoding: 'shift_jis' };
  }

  return { text: utf8Text, encoding: 'utf-8' };
}

function toMonthDate(month: string) {
  return `${month}-01`;
}

export async function POST(req: NextRequest) {
  const pool = getFinancePool();
  const client = await pool.connect();

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const requestedMonth = normalizeReportMonth(String(formData.get('reportMonth') || ''));
    const requestedEncoding = String(formData.get('encoding') || 'auto');

    if (!file) {
      return NextResponse.json({ error: 'ファイルを選択してください' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { text, encoding } = decodeBuffer(buffer, requestedEncoding);
    const parsed = parseTrialBalanceText(text);
    const reportMonth = requestedMonth || parsed.reportMonth;

    if (!reportMonth) {
      return NextResponse.json({
        error: '対象月を判定できませんでした。対象月を指定してください。',
      }, { status: 400 });
    }

    if (parsed.rows.length === 0) {
      return NextResponse.json({
        error: '合計残高試算表の科目行を読み取れませんでした。',
      }, { status: 400 });
    }

    const reportMonthDate = toMonthDate(reportMonth);

    await client.query('begin');

    await client.query(
      'delete from public.trial_balance_uploads where report_month = $1::date',
      [reportMonthDate]
    );

    const uploadResult = await client.query(
      `insert into public.trial_balance_uploads
        (report_month, company_name, period_label, file_name, encoding, file_size, source_text, row_count, bs_row_count, pl_row_count)
       values ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        reportMonthDate,
        parsed.companyName,
        parsed.periodLabel,
        file.name,
        encoding,
        buffer.length,
        text,
        parsed.rows.length,
        parsed.bsRowCount,
        parsed.plRowCount,
      ]
    );

    const uploadId = uploadResult.rows[0].id as string;

    const accountMap = new Map<string, string>();
    for (const row of parsed.rows) {
      if (!accountMap.has(row.accountCode)) accountMap.set(row.accountCode, row.accountName);
    }

    const accountEntries = [...accountMap.entries()];
    for (let i = 0; i < accountEntries.length; i += 300) {
      const batch = accountEntries.slice(i, i + 300);
      const values: unknown[] = [];
      const placeholders = batch.map(([code, name], idx) => {
        const base = idx * 2;
        values.push(code, name);
        return `($${base + 1}, $${base + 2}, '試算表', true)`;
      });

      await client.query(
        `insert into public.account_master (account_code, account_name, account_type, is_active)
         values ${placeholders.join(',')}
         on conflict (account_code) do update
           set account_name = excluded.account_name,
               is_active = true,
               updated_at = now()`,
        values
      );
    }

    for (let i = 0; i < parsed.rows.length; i += 300) {
      const batch = parsed.rows.slice(i, i + 300);
      const values: unknown[] = [];
      const placeholders = batch.map((row, idx) => {
        const base = idx * 12;
        values.push(
          uploadId,
          reportMonthDate,
          row.statementType,
          row.accountCode,
          row.accountName,
          row.openingBalance,
          row.debitAmount,
          row.creditAmount,
          row.closingBalance,
          row.ratio,
          row.rowNo,
          row.isSummary
        );
        return `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`;
      });

      await client.query(
        `insert into public.trial_balance_accounts
          (upload_id, report_month, statement_type, account_code, account_name,
           opening_balance, debit_amount, credit_amount, closing_balance, ratio, row_no, is_summary)
         values ${placeholders.join(',')}`,
        values
      );
    }

    await client.query('commit');

    return NextResponse.json({
      ok: true,
      uploadId,
      month: reportMonth,
      stats: {
        rows: parsed.rows.length,
        bsRows: parsed.bsRowCount,
        plRows: parsed.plRowCount,
        accounts: accountEntries.length,
        encoding,
      },
    });
  } catch (error: any) {
    await client.query('rollback').catch(() => {});
    console.error('[trial-balance-statement/import]', error);
    return NextResponse.json({
      ok: false,
      error: error?.message || '合計残高試算表の取込に失敗しました',
    }, { status: 500 });
  } finally {
    client.release();
  }
}
