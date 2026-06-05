import { NextRequest, NextResponse } from 'next/server';
import { getFinancePool } from '@/lib/finance/pg';
import { normalizeReportMonth } from '@/lib/finance/trial-balance-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TrialRow {
  id: string;
  statement_type: 'bs' | 'pl';
  account_code: string;
  account_name: string;
  opening_balance: string | number;
  debit_amount: string | number;
  credit_amount: string | number;
  closing_balance: string | number;
  ratio: string | number | null;
  row_no: number;
  is_summary: boolean;
}

interface LedgerRow {
  account_code: string;
  account_name: string | null;
  opening_balance: string | number | null;
  total_debit: string | number | null;
  total_credit: string | number | null;
  closing_balance: string | number | null;
  transaction_count: string | number | null;
}

function asNumber(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function inferStatementType(accountCode: string): 'bs' | 'pl' {
  const code = Number(accountCode);
  if ((code >= 400 && code <= 899) || code >= 9500) return 'pl';
  return 'bs';
}

function diffStatus(
  trial: { openingBalance: number; debitAmount: number; creditAmount: number; closingBalance: number },
  ledger?: { openingBalance: number; debitAmount: number; creditAmount: number; closingBalance: number }
) {
  if (!ledger) return 'trial_only';
  const diffs = {
    opening: trial.openingBalance - ledger.openingBalance,
    debit: trial.debitAmount - ledger.debitAmount,
    credit: trial.creditAmount - ledger.creditAmount,
    closing: trial.closingBalance - ledger.closingBalance,
  };
  // The imported general ledger is reliable as a monthly movement source.
  // Trial balance opening/closing balances need seeded beginning balances,
  // so the main reconciliation status is based on current debit/credit only.
  const isMatched = diffs.debit === 0 && diffs.credit === 0;
  return isMatched ? 'matched' : 'different';
}

function buildSummary(accounts: any[], ledgerOnlyAccounts: any[]) {
  const byCode = new Map(accounts.map((account) => [account.accountCode, account]));
  const pickAccount = (code: string) => byCode.get(code);
  const pick = (code: string) => pickAccount(code)?.closingBalance ?? 0;
  const current = (code: string) => {
    const account = pickAccount(code);
    return account ? account.closingBalance - account.openingBalance : 0;
  };
  const comparable = accounts.filter((account) => account.source === 'trial' && !account.isSummary);

  return {
    totalAssets: pick('9300'),
    totalLiabilities: pick('9400'),
    totalEquity: pick('9450'),
    totalLiabilitiesAndEquity: pick('9500'),
    netSales: pick('9530'),
    grossProfit: pick('9580'),
    operatingIncome: pick('9640'),
    ordinaryIncome: pick('9700'),
    netIncome: pick('9750'),
    currentNetSales: current('9530'),
    currentGrossProfit: current('9580'),
    currentOperatingIncome: current('9640'),
    currentOrdinaryIncome: current('9700'),
    currentNetIncome: current('9750'),
    currentGrossMargin: ratio(current('9580'), current('9530')),
    currentOperatingMargin: ratio(current('9640'), current('9530')),
    currentNetMargin: ratio(current('9750'), current('9530')),
    cashAndDeposits: pick('9055'),
    currentAssets: pick('9150'),
    currentLiabilities: pick('9350'),
    inventory: pick('9145'),
    receivables: pick('131'),
    payables: pick('201') + pick('204'),
    longTermDebt: pick('220'),
    matchedCount: comparable.filter((account) => account.matchStatus === 'matched').length,
    differentCount: comparable.filter((account) => account.matchStatus === 'different').length,
    trialOnlyCount: comparable.filter((account) => account.matchStatus === 'trial_only').length,
    ledgerOnlyCount: ledgerOnlyAccounts.filter((account) => account.hasMovement).length,
    balanceDifferentCount: comparable.filter((account) => account.ledger && (
      account.diffs?.opening !== 0 || account.diffs?.closing !== 0
    )).length,
  };
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function yen(value: number) {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function buildFinancialInsights(accounts: any[], summary: any) {
  const alerts: Array<{
    level: 'good' | 'info' | 'warning' | 'danger';
    title: string;
    body: string;
    metric?: string;
  }> = [];

  const issueCount = summary.differentCount + summary.trialOnlyCount;
  if (issueCount > 0) {
    alerts.push({
      level: 'danger',
      title: '元帳との突合に確認が必要です',
      body: '当月の借方・貸方が試算表と合っていない科目があります。先に差異タブで原因を確認してください。',
      metric: `${issueCount}件`,
    });
  } else {
    alerts.push({
      level: 'good',
      title: '試算表と元帳の当月発生額は一致しています',
      body: 'この月の分析は、会計事務所の試算表と元帳明細が同じ前提で見て大丈夫です。',
      metric: `${summary.matchedCount}科目`,
    });
  }

  if (summary.currentOperatingIncome < 0) {
    alerts.push({
      level: 'danger',
      title: '本業が赤字です',
      body: '営業利益がマイナスです。粗利不足か、販売費・管理費の重さを優先して確認してください。',
      metric: yen(summary.currentOperatingIncome),
    });
  } else if (summary.currentOperatingMargin < 0.05 && summary.currentNetSales > 0) {
    alerts.push({
      level: 'warning',
      title: '営業利益率が薄いです',
      body: '売上に対して本業の残りが少ない状態です。値引き、仕入、手数料、広告費のどれが重いか見ます。',
      metric: percent(summary.currentOperatingMargin),
    });
  }

  if (summary.currentNetIncome < 0) {
    alerts.push({
      level: 'danger',
      title: '当月最終赤字です',
      body: '営業外費用も含めた最終利益がマイナスです。単月要因か継続傾向か、前月と並べて確認してください。',
      metric: yen(summary.currentNetIncome),
    });
  }

  if (summary.currentGrossMargin > 0 && summary.currentGrossMargin < 0.45) {
    alerts.push({
      level: 'warning',
      title: '粗利率が低めです',
      body: '仕入・原価が売上に対して重い月です。商品構成、卸比率、値引き、送料込み販売を確認してください。',
      metric: percent(summary.currentGrossMargin),
    });
  }

  const monthlyCost = Math.max(0, summary.currentNetSales - summary.currentOperatingIncome);
  const cashMonths = monthlyCost > 0 ? summary.cashAndDeposits / monthlyCost : 0;
  if (cashMonths > 0 && cashMonths < 1.5) {
    alerts.push({
      level: 'warning',
      title: '現預金の余裕が薄めです',
      body: '今月の売上規模と費用感に対して、現預金のクッションが厚くありません。入金予定と支払予定を近めに見てください。',
      metric: `${cashMonths.toFixed(1)}ヶ月分`,
    });
  }

  if (summary.totalEquity < 0) {
    alerts.push({
      level: 'danger',
      title: '純資産がマイナスです',
      body: '利益は出ていても、過去の累積損失や借入負担が重い状態です。単月利益だけでなく、返済と資金繰りをセットで見ます。',
      metric: yen(summary.totalEquity),
    });
  }

  const inventoryMonths = summary.currentNetSales > 0
    ? summary.inventory / (summary.currentNetSales / 30)
    : 0;
  if (inventoryMonths > 60) {
    alerts.push({
      level: 'warning',
      title: '棚卸資産が重めです',
      body: '月商に対して在庫・原材料が厚い状態です。滞留品、賞味期限、仕入予定を確認してください。',
      metric: `${Math.round(inventoryMonths)}日分`,
    });
  }

  const expenseAccounts = accounts
    .filter((account) => account.source === 'trial' && !account.isSummary && account.statementType === 'pl')
    .map((account) => ({
      accountCode: account.accountCode,
      accountName: account.accountName,
      amount: Math.max(0, account.debitAmount - account.creditAmount),
      ratioToSales: ratio(Math.max(0, account.debitAmount - account.creditAmount), summary.currentNetSales),
    }))
    .filter((account) => account.amount > 0 && Number(account.accountCode) < 800)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const headline = [
    `当月売上は${yen(summary.currentNetSales)}、粗利率は${percent(summary.currentGrossMargin)}です。`,
    `営業利益は${yen(summary.currentOperatingIncome)}、当月純利益は${yen(summary.currentNetIncome)}です。`,
    issueCount === 0 ? '元帳突合は一致しています。' : '元帳突合に確認が必要です。',
  ].join('');

  return {
    headline,
    alerts,
    metrics: {
      cashMonths,
      inventoryDays: inventoryMonths,
      monthlyCost,
    },
    expenseAccounts,
  };
}

export async function GET(req: NextRequest) {
  const pool = getFinancePool();
  const client = await pool.connect();

  try {
    const monthParam = normalizeReportMonth(req.nextUrl.searchParams.get('month'));
    const monthsOnly = req.nextUrl.searchParams.get('months') === '1';

    const monthsResult = await client.query(`
      select to_char(report_month, 'YYYY-MM') as month,
             max(created_at) as imported_at,
             max(row_count)::int as row_count
        from public.trial_balance_uploads
       group by report_month
       order by report_month desc
    `);
    const months = monthsResult.rows.map((row) => ({
      month: row.month,
      importedAt: row.imported_at,
      rowCount: Number(row.row_count || 0),
    }));

    if (monthsOnly) {
      return NextResponse.json({ months }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const targetMonth = monthParam || months[0]?.month || null;
    if (!targetMonth) {
      return NextResponse.json({
        upload: null,
        accounts: [],
        months,
        summary: null,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const uploadResult = await client.query(
      `select id, to_char(report_month, 'YYYY-MM') as month, company_name, period_label,
              file_name, encoding, file_size, row_count, bs_row_count, pl_row_count, created_at
         from public.trial_balance_uploads
        where report_month = $1::date
        order by created_at desc
        limit 1`,
      [`${targetMonth}-01`]
    );

    const upload = uploadResult.rows[0] || null;
    if (!upload) {
      return NextResponse.json({
        upload: null,
        accounts: [],
        months,
        summary: null,
        month: targetMonth,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const trialResult = await client.query<TrialRow>(
      `select id, statement_type, account_code, account_name, opening_balance, debit_amount,
              credit_amount, closing_balance, ratio, row_no, is_summary
         from public.trial_balance_accounts
        where upload_id = $1
        order by case when statement_type = 'bs' then 0 else 1 end, row_no`,
      [upload.id]
    );

    const ledgerResult = await client.query<LedgerRow>(
      `select mab.account_code,
              am.account_name,
              mab.opening_balance,
              mab.total_debit,
              mab.total_credit,
              mab.closing_balance,
              mab.transaction_count
         from public.monthly_account_balance mab
         left join public.account_master am on am.account_code = mab.account_code
        where mab.report_month = $1::date`,
      [`${targetMonth}-01`]
    );

    const ledgerMap = new Map<string, any>();
    for (const row of ledgerResult.rows) {
      ledgerMap.set(row.account_code, {
        accountCode: row.account_code,
        accountName: row.account_name || row.account_code,
        openingBalance: asNumber(row.opening_balance),
        debitAmount: asNumber(row.total_debit),
        creditAmount: asNumber(row.total_credit),
        closingBalance: asNumber(row.closing_balance),
        transactionCount: asNumber(row.transaction_count),
      });
    }

    const seenCodes = new Set<string>();
    const accounts = trialResult.rows.map((row) => {
      seenCodes.add(row.account_code);
      const ledger = ledgerMap.get(row.account_code);
      const trial = {
        openingBalance: asNumber(row.opening_balance),
        debitAmount: asNumber(row.debit_amount),
        creditAmount: asNumber(row.credit_amount),
        closingBalance: asNumber(row.closing_balance),
      };
      const matchStatus = diffStatus(trial, ledger);

      return {
        id: row.id,
        source: 'trial',
        statementType: row.statement_type,
        accountCode: row.account_code,
        accountName: row.account_name,
        ratio: row.ratio === null ? null : asNumber(row.ratio),
        rowNo: row.row_no,
        isSummary: row.is_summary,
        ...trial,
        ledger,
        diffs: ledger ? {
          opening: trial.openingBalance - ledger.openingBalance,
          debit: trial.debitAmount - ledger.debitAmount,
          credit: trial.creditAmount - ledger.creditAmount,
          closing: trial.closingBalance - ledger.closingBalance,
        } : null,
        matchStatus,
      };
    });

    const ledgerOnlyAccounts = [];
    for (const ledger of ledgerMap.values()) {
      if (seenCodes.has(ledger.accountCode)) continue;
      const hasMovement = ledger.debitAmount !== 0 || ledger.creditAmount !== 0;
      const hasBalance = ledger.openingBalance !== 0 || ledger.closingBalance !== 0;
      ledgerOnlyAccounts.push({
        id: `ledger-${ledger.accountCode}`,
        source: 'ledger',
        statementType: inferStatementType(ledger.accountCode),
        accountCode: ledger.accountCode,
        accountName: ledger.accountName,
        ratio: null,
        rowNo: 999999,
        isSummary: false,
        openingBalance: 0,
        debitAmount: 0,
        creditAmount: 0,
        closingBalance: 0,
        ledger,
        diffs: {
          opening: -ledger.openingBalance,
          debit: -ledger.debitAmount,
          credit: -ledger.creditAmount,
          closing: -ledger.closingBalance,
        },
        matchStatus: 'ledger_only',
        hasMovement,
        hasBalance,
      });
    }

    const summary = buildSummary(accounts, ledgerOnlyAccounts);

    return NextResponse.json({
      month: targetMonth,
      upload: {
        id: upload.id,
        month: upload.month,
        companyName: upload.company_name,
        periodLabel: upload.period_label,
        fileName: upload.file_name,
        encoding: upload.encoding,
        fileSize: Number(upload.file_size || 0),
        rowCount: Number(upload.row_count || 0),
        bsRowCount: Number(upload.bs_row_count || 0),
        plRowCount: Number(upload.pl_row_count || 0),
        importedAt: upload.created_at,
      },
      months,
      accounts,
      ledgerOnlyAccounts,
      summary,
      insights: buildFinancialInsights(accounts, summary),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    console.error('[trial-balance-statement/get]', error);
    return NextResponse.json({
      error: error?.message || '合計残高試算表の取得に失敗しました',
    }, { status: 500 });
  } finally {
    client.release();
  }
}
