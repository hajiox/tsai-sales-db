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

const PERSONNEL_ACCOUNT_CODES = new Set(['500', '501', '502', '503', '504', '505', '509']);
const ADVERTISING_ACCOUNT_CODES = new Set(['510']);

function expenseAmount(account: { debitAmount: number; creditAmount: number }) {
  return Math.max(0, account.debitAmount - account.creditAmount);
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
  const personnelDetailCost = accounts
    .filter((account) => account.source === 'trial' && !account.isSummary && PERSONNEL_ACCOUNT_CODES.has(account.accountCode))
    .reduce((sum, account) => sum + expenseAmount(account), 0);
  const personnelSubtotal = Math.max(0, current('9605'));
  const currentPersonnelCost = personnelDetailCost > 0 ? personnelDetailCost : personnelSubtotal;
  const currentAdvertisingCost = accounts
    .filter((account) => account.source === 'trial' && !account.isSummary && ADVERTISING_ACCOUNT_CODES.has(account.accountCode))
    .reduce((sum, account) => sum + expenseAmount(account), 0);
  const cumulativePersonnelDetailCost = accounts
    .filter((account) => account.source === 'trial' && !account.isSummary && PERSONNEL_ACCOUNT_CODES.has(account.accountCode))
    .reduce((sum, account) => sum + Math.max(0, account.closingBalance), 0);
  const cumulativePersonnelSubtotal = Math.max(0, pick('9605'));
  const personnelCost = cumulativePersonnelSubtotal > 0
    ? cumulativePersonnelSubtotal
    : cumulativePersonnelDetailCost;
  const advertisingCost = Math.max(0, pick('510'));
  const sellingGeneralAdministrativeExpenses = Math.max(0, pick('9630'));
  const depreciation = Math.max(0, pick('528')) + Math.max(0, pick('3023'));
  const paymentFees = Math.max(0, pick('532'));
  const interestExpense = Math.max(0, pick('610'));
  const directorLongTermDebt = Math.max(0, pick('1219'));
  const leaseLiabilities = Math.max(0, pick('3027'));
  const longTermDebt = Math.max(0, pick('220'));
  const interestBearingDebt = longTermDebt + directorLongTermDebt + leaseLiabilities;
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
    sellingGeneralAdministrativeExpenses,
    grossMargin: ratio(pick('9580'), pick('9530')),
    operatingMargin: ratio(pick('9640'), pick('9530')),
    ordinaryMargin: ratio(pick('9700'), pick('9530')),
    netMargin: ratio(pick('9750'), pick('9530')),
    personnelCost,
    personnelRatio: ratio(personnelCost, pick('9530')),
    advertisingCost,
    advertisingRatio: ratio(advertisingCost, pick('9530')),
    paymentFees,
    paymentFeeRatio: ratio(paymentFees, pick('9530')),
    depreciation,
    depreciationRatio: ratio(depreciation, pick('9530')),
    interestExpense,
    currentNetSales: current('9530'),
    currentGrossProfit: current('9580'),
    currentOperatingIncome: current('9640'),
    currentOrdinaryIncome: current('9700'),
    currentNetIncome: current('9750'),
    currentPersonnelCost,
    currentPersonnelRatio: ratio(currentPersonnelCost, current('9530')),
    currentAdvertisingCost,
    currentAdvertisingRatio: ratio(currentAdvertisingCost, current('9530')),
    currentGrossMargin: ratio(current('9580'), current('9530')),
    currentOperatingMargin: ratio(current('9640'), current('9530')),
    currentNetMargin: ratio(current('9750'), current('9530')),
    cashAndDeposits: pick('9055'),
    currentAssets: pick('9150'),
    currentLiabilities: pick('9350'),
    inventory: pick('9145'),
    receivables: pick('131'),
    payables: pick('201') + pick('204'),
    longTermDebt,
    directorLongTermDebt,
    leaseLiabilities,
    interestBearingDebt,
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

  if (summary.currentPersonnelCost > 0) {
    if (summary.currentNetSales <= 0) {
      alerts.push({
        level: 'warning',
        title: '売上がない月に人件費が発生しています',
        body: '当月売上が未計上またはゼロの状態で人件費が出ています。売上計上漏れ、締め月、給与計上月のズレを確認してください。',
        metric: yen(summary.currentPersonnelCost),
      });
    } else if (summary.currentPersonnelRatio >= 0.35) {
      alerts.push({
        level: 'danger',
        title: '人件費比率がかなり高いです',
        body: '売上に対して人件費が重く、営業利益を強く圧迫しています。臨時給与、役員報酬、法定福利費、売上計上タイミングを確認してください。',
        metric: percent(summary.currentPersonnelRatio),
      });
    } else if (summary.currentPersonnelRatio >= 0.25) {
      alerts.push({
        level: 'warning',
        title: '人件費比率が高めです',
        body: '売上比で人件費がやや重い月です。人員配置、残業、賞与・臨時手当、売上の季節要因を合わせて確認してください。',
        metric: percent(summary.currentPersonnelRatio),
      });
    } else {
      alerts.push({
        level: 'info',
        title: '人件費比率は大きな警戒水準ではありません',
        body: '人件費は当月売上に対して極端には重くありません。利益が薄い場合は、仕入・広告費・手数料など他の費用要因も見てください。',
        metric: percent(summary.currentPersonnelRatio),
      });
    }
  }

  if (summary.currentAdvertisingCost > 0) {
    if (summary.currentNetSales <= 0) {
      alerts.push({
        level: 'warning',
        title: '売上がない月に広告宣伝費が発生しています',
        body: '広告宣伝費が発生していますが、当月売上が未計上またはゼロです。広告の対象月、売上計上漏れ、請求月のズレを確認してください。',
        metric: yen(summary.currentAdvertisingCost),
      });
    } else if (summary.currentAdvertisingRatio >= 0.15) {
      alerts.push({
        level: 'danger',
        title: '広告宣伝費比率がかなり高いです',
        body: '売上に対して広告宣伝費が重く、利益を強く圧迫しています。広告別の費用対効果、キャンペーン費、計上月のズレを確認してください。',
        metric: percent(summary.currentAdvertisingRatio),
      });
    } else if (summary.currentAdvertisingRatio >= 0.1) {
      alerts.push({
        level: 'warning',
        title: '広告宣伝費比率が高めです',
        body: '売上比で広告宣伝費がやや重い月です。広告費をかけた販売チャネルの売上増加と利益残りを確認してください。',
        metric: percent(summary.currentAdvertisingRatio),
      });
    } else {
      alerts.push({
        level: 'info',
        title: '広告宣伝費比率は大きな警戒水準ではありません',
        body: '広告宣伝費は当月売上に対して極端には重くありません。費用対効果を見る場合は、広告別売上や粗利と合わせて確認してください。',
        metric: percent(summary.currentAdvertisingRatio),
      });
    }
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

  const cumulativeExpenseAccounts = accounts
    .filter((account) => {
      if (account.source !== 'trial' || account.isSummary || account.statementType !== 'pl') return false;
      const code = Number(account.accountCode);
      return (code >= 500 && code < 800) || account.accountCode === '3023';
    })
    .map((account) => ({
      accountCode: account.accountCode,
      accountName: account.accountName,
      amount: Math.max(0, account.closingBalance),
      ratioToSales: ratio(Math.max(0, account.closingBalance), summary.netSales),
    }))
    .filter((account) => account.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  const headline = [
    `当月売上は${yen(summary.currentNetSales)}、粗利率は${percent(summary.currentGrossMargin)}です。`,
    `人件費は${yen(summary.currentPersonnelCost)}、売上比は${percent(summary.currentPersonnelRatio)}です。`,
    `広告宣伝費は${yen(summary.currentAdvertisingCost)}、売上比は${percent(summary.currentAdvertisingRatio)}です。`,
    `営業利益は${yen(summary.currentOperatingIncome)}、当月純利益は${yen(summary.currentNetIncome)}です。`,
    issueCount === 0 ? '元帳突合は一致しています。' : '元帳突合に確認が必要です。',
  ].join('');

  const cumulativeHeadline = [
    `今期累計売上は${yen(summary.netSales)}、粗利率は${percent(summary.grossMargin)}です。`,
    `販管費は${yen(summary.sellingGeneralAdministrativeExpenses)}、営業利益は${yen(summary.operatingIncome)}です。`,
    `当期純利益は${yen(summary.netIncome)}、現預金は${yen(summary.cashAndDeposits)}です。`,
  ].join('');

  return {
    headline,
    cumulativeHeadline,
    alerts,
    metrics: {
      cashMonths,
      inventoryDays: inventoryMonths,
      monthlyCost,
      personnelCost: summary.currentPersonnelCost,
      personnelRatio: summary.currentPersonnelRatio,
      advertisingCost: summary.currentAdvertisingCost,
      advertisingRatio: summary.currentAdvertisingRatio,
    },
    expenseAccounts,
    cumulativeExpenseAccounts,
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
