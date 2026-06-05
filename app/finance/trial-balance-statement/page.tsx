'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
} from 'lucide-react';

type MatchStatus = 'matched' | 'different' | 'trial_only' | 'ledger_only';
type Tab = 'all' | 'bs' | 'pl' | 'diff';

interface LedgerData {
  accountCode: string;
  accountName: string;
  openingBalance: number;
  debitAmount: number;
  creditAmount: number;
  closingBalance: number;
  transactionCount: number;
}

interface AccountRow {
  id: string;
  source: 'trial' | 'ledger';
  statementType: 'bs' | 'pl';
  accountCode: string;
  accountName: string;
  openingBalance: number;
  debitAmount: number;
  creditAmount: number;
  closingBalance: number;
  ratio: number | null;
  rowNo: number;
  isSummary: boolean;
  ledger: LedgerData | null;
  diffs: {
    opening: number;
    debit: number;
    credit: number;
    closing: number;
  } | null;
  matchStatus: MatchStatus;
}

interface TransactionRow {
  date: string;
  counterAccount: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface ApiResponse {
  month?: string;
  upload: null | {
    id: string;
    month: string;
    companyName: string | null;
    periodLabel: string | null;
    fileName: string;
    encoding: string;
    rowCount: number;
    bsRowCount: number;
    plRowCount: number;
    importedAt: string;
  };
  months: Array<{ month: string; importedAt: string; rowCount: number }>;
  accounts: AccountRow[];
  summary: null | {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
    netSales: number;
    grossProfit: number;
    operatingIncome: number;
    ordinaryIncome: number;
    netIncome: number;
    currentNetSales: number;
    currentGrossProfit: number;
    currentOperatingIncome: number;
    currentOrdinaryIncome: number;
    currentNetIncome: number;
    currentGrossMargin: number;
    currentOperatingMargin: number;
    currentNetMargin: number;
    cashAndDeposits: number;
    currentAssets: number;
    currentLiabilities: number;
    inventory: number;
    receivables: number;
    payables: number;
    longTermDebt: number;
    matchedCount: number;
    differentCount: number;
    trialOnlyCount: number;
    ledgerOnlyCount: number;
    balanceDifferentCount: number;
  };
  insights?: {
    headline: string;
    alerts: Array<{
      level: 'good' | 'info' | 'warning' | 'danger';
      title: string;
      body: string;
      metric?: string;
    }>;
    metrics: {
      cashMonths: number;
      inventoryDays: number;
      monthlyCost: number;
    };
    expenseAccounts: Array<{
      accountCode: string;
      accountName: string;
      amount: number;
      ratioToSales: number;
    }>;
  };
}

function yen(value: number) {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function diffText(value: number) {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : ''}${yen(value)}`;
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function statusLabel(status: MatchStatus) {
  switch (status) {
    case 'matched':
      return '一致';
    case 'different':
      return '差異あり';
    case 'trial_only':
      return '試算表のみ';
    case 'ledger_only':
      return '元帳のみ';
    default:
      return status;
  }
}

function statusClass(status: MatchStatus) {
  switch (status) {
    case 'matched':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'different':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'trial_only':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'ledger_only':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function SummaryCard({
  label,
  value,
  sub,
  tone = 'slate',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'blue';
}) {
  const tones = {
    slate: 'bg-white border-slate-200 text-slate-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    rose: 'bg-rose-50 border-rose-200 text-rose-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function alertToneClass(level: 'good' | 'info' | 'warning' | 'danger') {
  switch (level) {
    case 'good':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'danger':
      return 'border-rose-200 bg-rose-50 text-rose-900';
    default:
      return 'border-blue-200 bg-blue-50 text-blue-900';
  }
}

function alertBadgeClass(level: 'good' | 'info' | 'warning' | 'danger') {
  switch (level) {
    case 'good':
      return 'bg-emerald-600 text-white';
    case 'warning':
      return 'bg-amber-500 text-white';
    case 'danger':
      return 'bg-rose-600 text-white';
    default:
      return 'bg-blue-600 text-white';
  }
}

function InsightMetric({
  label,
  value,
  sub,
  tone = 'slate',
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'blue';
}) {
  const tones = {
    slate: 'border-slate-200 bg-white',
    emerald: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
    rose: 'border-rose-200 bg-rose-50',
    blue: 'border-blue-200 bg-blue-50',
  };

  return (
    <div className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

export default function TrialBalanceStatementPage() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [transactions, setTransactions] = useState<Record<string, TransactionRow[]>>({});
  const [loadingTransactions, setLoadingTransactions] = useState<Set<string>>(new Set());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSelectedMonth(params.get('month') || '');
  }, []);

  useEffect(() => {
    if (selectedMonth === null) return;
    fetchData(selectedMonth);
  }, [selectedMonth]);

  async function fetchData(month: string) {
    setLoading(true);
    setError('');
    try {
      const url = month
        ? `/api/finance/trial-balance-statement?month=${encodeURIComponent(month)}`
        : '/api/finance/trial-balance-statement';
      const response = await fetch(url, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'データ取得に失敗しました');
      setData(json);
      setExpanded(new Set());
      setTransactions({});

      if (!month && json.month) {
        setSelectedMonth(json.month);
        window.history.replaceState(null, '', `/finance/trial-balance-statement?month=${json.month}`);
      }
    } catch (err: any) {
      setError(err?.message || 'データ取得に失敗しました');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function toggleTransactions(accountCode: string) {
    const next = new Set(expanded);
    if (next.has(accountCode)) {
      next.delete(accountCode);
      setExpanded(next);
      return;
    }

    next.add(accountCode);
    setExpanded(next);

    if (transactions[accountCode] || !data?.month) return;

    setLoadingTransactions((prev) => new Set(prev).add(accountCode));
    try {
      const response = await fetch(
        `/api/finance/transactions?month=${encodeURIComponent(data.month)}&accountCode=${encodeURIComponent(accountCode)}`
      );
      const json = await response.json();
      setTransactions((prev) => ({
        ...prev,
        [accountCode]: json.transactions || [],
      }));
    } finally {
      setLoadingTransactions((prev) => {
        const copy = new Set(prev);
        copy.delete(accountCode);
        return copy;
      });
    }
  }

  const visibleAccounts = useMemo(() => {
    const accounts = data?.accounts || [];
    return accounts.filter((account) => {
      if (tab === 'bs') return account.statementType === 'bs';
      if (tab === 'pl') return account.statementType === 'pl';
      if (tab === 'diff') return account.matchStatus !== 'matched';
      return true;
    });
  }, [data, tab]);

  const currentMonth = data?.month || selectedMonth || '';
  const diffCount = data?.summary
    ? data.summary.differentCount + data.summary.trialOnlyCount
    : 0;

  return (
    <div className="p-6 max-w-[1500px] mx-auto space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <button
            onClick={() => router.push('/finance/dashboard')}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            ダッシュボードへ戻る
          </button>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </span>
            合計残高試算表
          </h1>
          <p className="text-sm text-slate-500 mt-1 ml-[52px]">
            会計事務所の試算表と、総勘定元帳から集計した月次残高を科目別に突合します。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={currentMonth}
            onChange={(event) => {
              const month = event.target.value;
              setSelectedMonth(month);
              window.history.replaceState(null, '', `/finance/trial-balance-statement?month=${month}`);
            }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
          />
          <button
            onClick={() => fetchData(currentMonth)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
          >
            <RefreshCw className="w-4 h-4" />
            更新
          </button>
          <button
            onClick={() => router.push('/finance/trial-balance-statement/import')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition"
          >
            <Upload className="w-4 h-4" />
            試算表取込
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : !data?.upload ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-4">
          <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto" />
          <div>
            <h2 className="text-lg font-bold text-slate-700">合計残高試算表が未取込です</h2>
            <p className="text-sm text-slate-500 mt-1">まず会計事務所から受け取ったTXT/CSVを取り込んでください。</p>
          </div>
          <button
            onClick={() => router.push('/finance/trial-balance-statement/import')}
            className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition"
          >
            <Upload className="w-4 h-4" />
            取込画面へ
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{data.upload.companyName || '会社名未取得'}</span>
              <span className="mx-2 text-slate-300">/</span>
              {data.upload.fileName}
              <span className="mx-2 text-slate-300">/</span>
              {data.upload.rowCount}行
            </div>
            <div className="text-xs text-slate-400">
              取込日時: {new Date(data.upload.importedAt).toLocaleString('ja-JP')} / {data.upload.encoding}
            </div>
          </div>

          {data.summary && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <SummaryCard label="累計純売上高" value={yen(data.summary.netSales)} sub={`当月 ${yen(data.summary.currentNetSales)}`} tone="blue" />
              <SummaryCard label="累計当期純利益" value={yen(data.summary.netIncome)} sub={`当月 ${yen(data.summary.currentNetIncome)}`} tone={data.summary.netIncome >= 0 ? 'emerald' : 'rose'} />
              <SummaryCard label="資産の部" value={yen(data.summary.totalAssets)} sub={`現預金 ${yen(data.summary.cashAndDeposits)}`} />
              <SummaryCard label="元帳突合OK" value={`${data.summary.matchedCount}件`} sub="当月の借方・貸方一致" tone="emerald" />
              <SummaryCard
                label="要確認"
                value={`${diffCount}件`}
                sub={`借方・貸方差異 ${data.summary.differentCount} / 試算表のみ ${data.summary.trialOnlyCount}`}
                tone={diffCount === 0 ? 'emerald' : 'amber'}
              />
            </div>
          )}

          {data.summary && (data.summary.ledgerOnlyCount > 0 || data.summary.balanceDifferentCount > 0) && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              突合判定は当月の借方・貸方で行います。元帳側の期首残高が未設定の科目があるため、残高差 {data.summary.balanceDifferentCount}件と元帳のみ科目 {data.summary.ledgerOnlyCount}件は参考情報として扱います。
            </div>
          )}

          {data.summary && data.insights && (
            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-emerald-700 mb-2">今月の見立て</div>
                    <h2 className="text-xl font-bold text-slate-900">まずここを見れば大枠が分かります</h2>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{data.insights.headline}</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3 lg:min-w-[520px]">
                    <InsightMetric
                      label="当月売上"
                      value={yen(data.summary.currentNetSales)}
                      sub={`累計 ${yen(data.summary.netSales)}`}
                      tone="blue"
                    />
                    <InsightMetric
                      label="当月粗利率"
                      value={percent(data.summary.currentGrossMargin)}
                      sub={`粗利 ${yen(data.summary.currentGrossProfit)}`}
                      tone={data.summary.currentGrossMargin < 0.45 ? 'amber' : 'emerald'}
                    />
                    <InsightMetric
                      label="当月営業利益"
                      value={yen(data.summary.currentOperatingIncome)}
                      sub={`営業利益率 ${percent(data.summary.currentOperatingMargin)}`}
                      tone={data.summary.currentOperatingIncome < 0 ? 'rose' : 'emerald'}
                    />
                    <InsightMetric
                      label="現預金"
                      value={yen(data.summary.cashAndDeposits)}
                      sub={`費用目安 ${data.insights.metrics.cashMonths.toFixed(1)}ヶ月分`}
                      tone={data.insights.metrics.cashMonths < 1.5 ? 'amber' : 'slate'}
                    />
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900">アラート</h3>
                    <p className="text-xs text-slate-500 mt-1">赤・黄は先に確認。緑は前提確認です。</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {data.insights.alerts.map((alert, index) => (
                      <div key={`${alert.title}-${index}`} className={`p-4 border-l-4 ${alertToneClass(alert.level)}`}>
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div>
                            <div className="font-bold">{alert.title}</div>
                            <div className="text-sm leading-6 mt-1 opacity-80">{alert.body}</div>
                          </div>
                          {alert.metric && (
                            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${alertBadgeClass(alert.level)}`}>
                              {alert.metric}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900">費用の大きい科目</h3>
                    <p className="text-xs text-slate-500 mt-1">気になった科目は下の一覧から元帳明細を開きます。</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {data.insights.expenseAccounts.map((account) => (
                      <div key={account.accountCode} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 truncate">{account.accountName}</div>
                            <div className="text-xs text-slate-400">{account.accountCode}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-slate-900">{yen(account.amount)}</div>
                            <div className="text-xs text-slate-500">売上比 {percent(account.ratioToSales)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="flex flex-wrap gap-2 border-b border-slate-200">
            {[
              ['all', '全科目'],
              ['bs', '貸借対照表'],
              ['pl', '損益計算書'],
              ['diff', '差異のみ'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key as Tab)}
                className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition ${
                  tab === key
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 text-left w-10"></th>
                    <th className="px-3 py-3 text-left text-slate-600">区分</th>
                    <th className="px-3 py-3 text-left text-slate-600">科目</th>
                    <th className="px-3 py-3 text-right text-slate-600">試算表 前月</th>
                    <th className="px-3 py-3 text-right text-slate-600">試算表 借方</th>
                    <th className="px-3 py-3 text-right text-slate-600">試算表 貸方</th>
                    <th className="px-3 py-3 text-right text-slate-600">試算表 当月</th>
                    <th className="px-3 py-3 text-right text-slate-600">元帳 当月</th>
                    <th className="px-3 py-3 text-right text-slate-600">差異</th>
                    <th className="px-3 py-3 text-center text-slate-600">状態</th>
                    <th className="px-3 py-3 text-center text-slate-600">元帳</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAccounts.map((account) => {
                    const isExpanded = expanded.has(account.accountCode);
                    const accountTransactions = transactions[account.accountCode] || [];
                    const isLoadingRows = loadingTransactions.has(account.accountCode);
                    const canOpenLedger = Boolean(account.ledger?.transactionCount);

                    return (
                      <FragmentRow
                        key={account.id}
                        account={account}
                        isExpanded={isExpanded}
                        canOpenLedger={canOpenLedger}
                        isLoadingRows={isLoadingRows}
                        transactions={accountTransactions}
                        onToggle={() => toggleTransactions(account.accountCode)}
                        month={currentMonth}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FragmentRow({
  account,
  isExpanded,
  canOpenLedger,
  isLoadingRows,
  transactions,
  onToggle,
  month,
}: {
  account: AccountRow;
  isExpanded: boolean;
  canOpenLedger: boolean;
  isLoadingRows: boolean;
  transactions: TransactionRow[];
  onToggle: () => void;
  month: string;
}) {
  const debitDiff = account.diffs?.debit ?? 0;
  const creditDiff = account.diffs?.credit ?? 0;
  const hasMovementDiff = debitDiff !== 0 || creditDiff !== 0;
  const hasBalanceDiff = Boolean(account.ledger) && (
    (account.diffs?.opening ?? 0) !== 0 || (account.diffs?.closing ?? 0) !== 0
  );
  const ledgerComparableBalance = account.ledger
    ? account.statementType === 'pl'
      ? Math.abs(account.ledger.debitAmount - account.ledger.creditAmount)
      : account.ledger.closingBalance
    : null;

  return (
    <>
      <tr className={`border-b border-slate-100 hover:bg-slate-50 ${account.isSummary ? 'bg-slate-50/70 font-semibold' : ''}`}>
        <td className="px-3 py-2">
          <button
            onClick={onToggle}
            disabled={!canOpenLedger}
            className="w-7 h-7 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-25 disabled:cursor-not-allowed"
            title={canOpenLedger ? '元帳明細を表示' : '元帳明細なし'}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="px-3 py-2">
          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
            account.statementType === 'bs' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
          }`}>
            {account.statementType === 'bs' ? 'BS' : 'PL'}
          </span>
        </td>
        <td className="px-3 py-2 min-w-[260px]">
          <div className="font-semibold text-slate-800">{account.accountCode} {account.accountName}</div>
          {account.ledger && (
            <div className="text-xs text-slate-400">元帳明細 {account.ledger.transactionCount}件</div>
          )}
        </td>
        <td className="px-3 py-2 text-right font-mono text-slate-600">{yen(account.openingBalance)}</td>
        <td className="px-3 py-2 text-right font-mono text-slate-600">{yen(account.debitAmount)}</td>
        <td className="px-3 py-2 text-right font-mono text-slate-600">{yen(account.creditAmount)}</td>
        <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">{yen(account.closingBalance)}</td>
        <td className="px-3 py-2 text-right font-mono text-slate-600">
          {ledgerComparableBalance !== null ? yen(ledgerComparableBalance) : '-'}
        </td>
        <td className={`px-3 py-2 text-right font-mono font-semibold ${hasMovementDiff ? 'text-amber-700' : 'text-slate-400'}`}>
          {account.ledger ? (
            hasMovementDiff ? (
              <div className="leading-tight">
                <div>借 {diffText(debitDiff)}</div>
                <div>貸 {diffText(creditDiff)}</div>
              </div>
            ) : (
              <div>
                <div>0</div>
                {hasBalanceDiff && <div className="text-[10px] font-normal text-slate-400 mt-0.5">残高差は参考</div>}
              </div>
            )
          ) : '-'}
        </td>
        <td className="px-3 py-2 text-center">
          <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full border text-xs font-semibold ${statusClass(account.matchStatus)}`}>
            {account.matchStatus === 'matched' && <CheckCircle2 className="w-3 h-3 mr-1" />}
            {account.matchStatus !== 'matched' && <AlertTriangle className="w-3 h-3 mr-1" />}
            {statusLabel(account.matchStatus)}
          </span>
        </td>
        <td className="px-3 py-2 text-center">
          <a
            href={`/finance/general-ledger-detail?month=${month}`}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <BookOpen className="w-3.5 h-3.5" />
            検索
          </a>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td colSpan={11} className="p-4">
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">
                {account.accountCode} {account.accountName} の総勘定元帳明細
              </div>
              {isLoadingRows ? (
                <div className="p-6 flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  読み込み中...
                </div>
              ) : transactions.length === 0 ? (
                <div className="p-6 text-sm text-slate-400">元帳明細がありません。</div>
              ) : (
                <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="border-b border-slate-100">
                        <th className="px-3 py-2 text-left">日付</th>
                        <th className="px-3 py-2 text-left">相手科目</th>
                        <th className="px-3 py-2 text-left">摘要</th>
                        <th className="px-3 py-2 text-right">借方</th>
                        <th className="px-3 py-2 text-right">貸方</th>
                        <th className="px-3 py-2 text-right">残高</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((row, index) => (
                        <tr key={`${row.date}-${index}`} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                          <td className="px-3 py-2">{row.counterAccount}</td>
                          <td className="px-3 py-2 min-w-[300px]">{row.description}</td>
                          <td className="px-3 py-2 text-right font-mono">{row.debit ? yen(row.debit) : ''}</td>
                          <td className="px-3 py-2 text-right font-mono">{row.credit ? yen(row.credit) : ''}</td>
                          <td className="px-3 py-2 text-right font-mono">{yen(row.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
