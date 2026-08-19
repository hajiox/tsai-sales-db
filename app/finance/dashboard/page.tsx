// app/finance/dashboard/page.tsx
// 財務分析システム メインダッシュボード ver.2
// - 月選択ジャンプ付き
// - データ削除機能付き（確認ダイアログ）
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  FileSpreadsheet,
  Upload,
  BarChart3,
  BookOpen,
  Loader2,
  Scale,
  Trash2,
  ExternalLink,
  Search,
  ClipboardList,
  Target,
  Gauge,
  ArrowUpRight,
  Factory,
  Files,
  Wallet,
  Package,
  Landmark,
} from 'lucide-react';

// --- Types ---
interface MonthStatus {
  month: string;
  accountCount: number;
  transactionCount: number;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

interface SearchResult {
  report_month: string;
  transaction_date: string;
  account_code: string;
  counter_account: string;
  department: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  balance: number;
}

type SignalTone = 'emerald' | 'amber' | 'rose' | 'blue' | 'slate';

interface FinanceInsightResponse {
  month?: string;
  months?: Array<{ month: string }>;
  summary: FinanceInsightSummary | null;
  insights?: {
    headline?: string;
    cumulativeHeadline?: string;
    metrics?: {
      monthlyCost?: number;
      personnelCost?: number;
      personnelRatio?: number;
      advertisingCost?: number;
      advertisingRatio?: number;
    };
    expenseAccounts?: Array<{
      accountCode: string;
      accountName: string;
      amount: number;
      ratioToSales: number;
    }>;
    cumulativeExpenseAccounts?: Array<{
      accountCode: string;
      accountName: string;
      amount: number;
      ratioToSales: number;
    }>;
  };
}

interface FinanceInsightSummary {
  netSales: number;
  grossProfit: number;
  sellingGeneralAdministrativeExpenses: number;
  operatingIncome: number;
  ordinaryIncome: number;
  netIncome: number;
  grossMargin: number;
  operatingMargin: number;
  ordinaryMargin: number;
  netMargin: number;
  personnelCost: number;
  personnelRatio: number;
  advertisingCost: number;
  advertisingRatio: number;
  paymentFees: number;
  paymentFeeRatio: number;
  depreciation: number;
  depreciationRatio: number;
  interestExpense: number;
  cashAndDeposits: number;
  inventory: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  longTermDebt: number;
  directorLongTermDebt: number;
  leaseLiabilities: number;
  interestBearingDebt: number;
  currentNetSales: number;
  currentGrossProfit: number;
  currentOperatingIncome: number;
  currentNetIncome: number;
  currentPersonnelCost: number;
  currentPersonnelRatio: number;
  currentAdvertisingCost: number;
  currentAdvertisingRatio: number;
  currentGrossMargin: number;
  currentOperatingMargin: number;
}

// --- Helpers ---
function fmt(n: number): string {
  return n.toLocaleString('ja-JP');
}

function yen(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe < 0 ? '-' : '';
  return `${sign}¥${Math.abs(Math.round(safe)).toLocaleString('ja-JP')}`;
}

function percent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${(safe * 100).toFixed(1)}%`;
}

function formatMonth(month?: string): string {
  if (!month) return '最新月';
  const [year, monthPart] = month.split('-');
  return `${Number(year)}年${Number(monthPart)}月`;
}

function getFiscalPeriod(month?: string, importedMonths: Array<{ month: string }> = []) {
  if (!month) {
    return { label: '今期累計', importedCount: 0, elapsedMonths: 0 };
  }

  const [year, monthNumber] = month.split('-').map(Number);
  const startYear = monthNumber >= 8 ? year : year - 1;
  const start = `${startYear}-08`;
  const end = `${startYear + 1}-07`;
  const elapsedMonths = (year - startYear) * 12 + monthNumber - 7;
  const importedCount = new Set(
    importedMonths
      .map((item) => item.month)
      .filter((itemMonth) => itemMonth >= start && itemMonth <= month),
  ).size;

  return {
    label: `${formatMonth(start)}〜${formatMonth(month)}`,
    importedCount,
    elapsedMonths,
    end,
  };
}

function toReiwa(year: number): string {
  const r = year - 2018;
  if (r === 1) return '令和元年';
  if (r >= 2) return `令和${r}年`;
  return `平成${year - 1988}年`;
}

function getYearRange(months: MonthStatus[]): number[] {
  if (months.length === 0) return [new Date().getFullYear()];
  const years = new Set(months.map(m => parseInt(m.month.split('-')[0])));
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years, new Date().getFullYear());
  const result: number[] = [];
  for (let y = minYear; y <= maxYear; y++) result.push(y);
  return result;
}

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

export default function FinanceDashboardPage() {
  const router = useRouter();
  const [monthData, setMonthData] = useState<MonthStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // 削除関連
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  // 検索関連
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchPage, setSearchPage] = useState(0);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const SEARCH_PER_PAGE = 100;

  // 決算データ
  const [closingCount, setClosingCount] = useState<number>(0);
  const [closingLoading, setClosingLoading] = useState(false);

  // 今期累計の経営シグナル
  const [insightData, setInsightData] = useState<FinanceInsightResponse | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  async function doSearch(query: string, page: number) {
    setSearching(true);
    try {
      const offset = page * SEARCH_PER_PAGE;
      const res = await fetch(`/api/finance/search?q=${encodeURIComponent(query)}&limit=${SEARCH_PER_PAGE}&offset=${offset}`);
      const json = await res.json();
      setSearchResults(json.results || []);
      setSearchTotal(json.total || 0);
      setSearchPage(page);
    } catch { setSearchResults([]); }
    setSearching(false);
  }

  useEffect(() => {
    fetchImportStatus();
    fetchLatestInsight();
  }, []);

  async function fetchImportStatus() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/finance/import-status');
      if (!res.ok) throw new Error('データ取得に失敗しました');
      const json = await res.json();
      setMonthData(json.months || []);
      if (json.months && json.months.length > 0) {
        const latestMonth = json.months[json.months.length - 1].month;
        setSelectedYear(parseInt(latestMonth.split('-')[0]));
      }
    } catch (e: any) {
      setError(e?.message || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  async function fetchLatestInsight() {
    setInsightLoading(true);
    try {
      const res = await fetch('/api/finance/trial-balance-statement', { cache: 'no-store' });
      if (!res.ok) throw new Error('今期累計の財務見立てを取得できませんでした');
      const json = await res.json();
      setInsightData(json?.summary ? json : null);
    } catch (e) {
      console.error(e);
      setInsightData(null);
    } finally {
      setInsightLoading(false);
    }
  }

  // 月ステータスのマップ
  const monthMap = useMemo(() => {
    const map = new Map<string, MonthStatus>();
    monthData.forEach(m => map.set(m.month, m));
    return map;
  }, [monthData]);

  const years = useMemo(() => getYearRange(monthData), [monthData]);

  // 集計
  const totalMonths = monthData.length;
  const latestMonth = monthData.length > 0 ? monthData[monthData.length - 1].month : '—';
  const totalTransactions = monthData.reduce((s, m) => s + m.transactionCount, 0);
  const unbalancedCount = monthData.filter(m => !m.isBalanced).length;

  const yearMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, '0');
      const key = `${selectedYear}-${mm}`;
      return { key, label: MONTH_LABELS[i], data: monthMap.get(key) || null };
    });
  }, [selectedYear, monthMap]);

  const yearTotalTransactions = yearMonths.reduce((s, m) => s + (m.data?.transactionCount || 0), 0);
  const yearImportedCount = yearMonths.filter(m => m.data).length;

  // 決算データ件数チェック
  useEffect(() => {
    async function checkClosing() {
      setClosingLoading(true);
      try {
        const res = await fetch(`/api/finance/search?q=${encodeURIComponent('[決算]')}&limit=1&offset=0&month=${selectedYear}-07`);
        const json = await res.json();
        setClosingCount(json.total || 0);
      } catch {
        setClosingCount(0);
      } finally {
        setClosingLoading(false);
      }
    }
    checkClosing();
  }, [selectedYear]);

  function navigateToMonth(month: string) {
    router.push(`/finance/trial-balance?month=${month}`);
  }

  // 削除
  function openDeleteDialog(month: string) {
    setDeleteTarget(month);
    setDeleteConfirmText('');
    dialogRef.current?.showModal();
  }

  function closeDeleteDialog() {
    dialogRef.current?.close();
    setDeleteTarget(null);
    setDeleteConfirmText('');
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/finance/trial-balance/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: deleteTarget }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || '削除に失敗しました');
      }
      closeDeleteDialog();
      await fetchImportStatus();
      await fetchLatestInsight();
    } catch (e: any) {
      setError(e?.message || '削除エラー');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-3 py-4 sm:px-4 lg:space-y-8 lg:p-6">
      {/* ヘッダー + 月選択ジャンプ */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="flex items-center gap-3 text-xl font-bold text-slate-800 sm:text-2xl">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
              <Scale className="w-5 h-5 text-white" />
            </div>
            財務分析ダッシュボード
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 lg:ml-[52px] lg:mt-1">
            今期累計の損益と、最新入力時点の資金・負債・在庫を一覧で確認
          </p>
        </div>
        {/* インポートボタン */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <button
            onClick={() => router.push('/finance/general-ledger/import')}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 lg:px-4"
          >
            <Upload className="w-4 h-4" />
            総勘定元帳取込
          </button>
          <button
            onClick={() => router.push('/finance/trial-balance-statement/import')}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 lg:px-4"
          >
            <FileSpreadsheet className="w-4 h-4" />
            試算表取込
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      )}

      <BusinessSignalPanel data={insightData} loading={insightLoading} />

      {/* クイックリンク */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 xl:grid-cols-7">
        <QuickLink icon={<BarChart3 className="w-5 h-5" />} title="損益分析ビューアー" description="科目別の収支とAIコスト分析" href="/finance/trial-balance" color="indigo" />
        <QuickLink icon={<TrendingUp className="w-5 h-5" />} title="財務概要" description="BS・PL合計とバランスチェック" href="/finance/overview" color="emerald" />
        <QuickLink icon={<Upload className="w-5 h-5" />} title="仕訳CSVインポート" description="月次仕訳データの取り込み" href="/finance/general-ledger/import" color="blue" />
        <QuickLink icon={<FileSpreadsheet className="w-5 h-5" />} title="合計残高試算表" description="試算表取込と元帳突合" href="/finance/trial-balance-statement" color="emerald" />
        <QuickLink icon={<FileSpreadsheet className="w-5 h-5" />} title="決算仕訳インポート" description="決算整理仕訳の取り込み" href="/finance/general-ledger/closing-import" color="violet" />
        <QuickLink icon={<Factory className="w-5 h-5" />} title="チャーシュー製造原価" description="製造実績と商品別原価" href="/finance/char-siu-production" color="emerald" />
        <QuickLink icon={<Files className="w-5 h-5" />} title="決算書PDF" description="年次決算の取込と借入・在庫比較" href="/finance/annual-statements" color="indigo" />
      </div>

      {/* 月次取込 */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:rounded-2xl">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-slate-800">月次取込</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            先に総勘定元帳を取り込み、その後に会計事務所の合計残高試算表を取り込むと、試算表画面で突合・アラート確認までできます。
          </p>
        </div>
        <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2 lg:gap-4">
          <button
            onClick={() => router.push('/finance/general-ledger/import')}
            className="group rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-left hover:bg-blue-50 hover:border-blue-300 transition"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-blue-600 mb-1">STEP 1</div>
                <div className="font-bold text-slate-900">総勘定元帳を取り込む</div>
                <p className="text-sm text-slate-600 mt-1 leading-6">
                  会計事務所から受け取った総勘定元帳CSV/TXTを取り込み、月次の仕訳・科目残高を作成します。
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => router.push('/finance/trial-balance-statement/import')}
            className="group rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-left hover:bg-emerald-50 hover:border-emerald-300 transition"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-600 mb-1">STEP 2</div>
                <div className="font-bold text-slate-900">合計残高試算表を取り込む</div>
                <p className="text-sm text-slate-600 mt-1 leading-6">
                  試算表を取り込むと、元帳との突合、今月の見立て、アラート、費用上位を確認できます。
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* サマリーカード */}
      {/* 検索バー */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:rounded-2xl">
        <div className="flex min-h-12 items-center gap-3 px-4 py-3 lg:px-5">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              const q = e.target.value;
              setSearchQuery(q);
              if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
              if (q.trim().length >= 2) {
                setShowSearch(true);
                setSearchPage(0);
                searchTimerRef.current = setTimeout(() => doSearch(q.trim(), 0), 400);
              } else {
                setShowSearch(false);
                setSearchResults([]);
              }
            }}
            placeholder="仕訳検索…（例: 電気、給料、地代家賃）"
            className="flex-1 text-sm outline-none bg-transparent text-slate-700 placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setShowSearch(false); setSearchResults([]); setSearchPage(0); }} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
          )}
          {searching && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>
        {showSearch && (
          <div className="border-t border-slate-100">
            {searchResults.length === 0 && !searching ? (
              <div className="px-6 py-8 text-center text-sm text-slate-400">該当する仕訳が見つかりません</div>
            ) : (
              <>
                <div className="flex flex-col gap-2 bg-slate-50 px-4 py-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-5">
                  <span>{searchTotal}件中 {searchPage * SEARCH_PER_PAGE + 1}〜{Math.min((searchPage + 1) * SEARCH_PER_PAGE, searchTotal)}件を表示</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => doSearch(searchQuery.trim(), searchPage - 1)}
                      disabled={searchPage === 0 || searching}
                      className="px-2 py-0.5 rounded text-xs border border-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >← 前</button>
                    <span className="text-xs text-slate-400">{searchPage + 1} / {Math.ceil(searchTotal / SEARCH_PER_PAGE)}</span>
                    <button
                      onClick={() => doSearch(searchQuery.trim(), searchPage + 1)}
                      disabled={(searchPage + 1) * SEARCH_PER_PAGE >= searchTotal || searching}
                      className="px-2 py-0.5 rounded text-xs border border-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >次 →</button>
                  </div>
                </div>
                <div className="max-h-[400px] overflow-x-auto overflow-y-auto overscroll-contain">
                  <table className="min-w-[720px] w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="px-3 py-2 text-left font-medium text-slate-600">日付</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">科目</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">相手科目</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">摘要</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600">借方</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600">貸方</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((r, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.transaction_date?.slice(0, 10)}</td>
                          <td className="px-3 py-2 text-slate-700 font-medium">{r.account_code}</td>
                          <td className="px-3 py-2 text-slate-500">{r.counter_account}</td>
                          <td className="px-3 py-2 text-slate-600 max-w-[300px] truncate">{r.description}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{r.debit_amount ? `¥${fmt(r.debit_amount)}` : ''}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{r.credit_amount ? `¥${fmt(r.credit_amount)}` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <SummaryCard
          icon={<Calendar className="w-5 h-5" />}
          label="取り込み済み月数"
          value={`${totalMonths}ヶ月`}
          color="emerald"
        />
        <SummaryCard
          icon={<FileSpreadsheet className="w-5 h-5" />}
          label="最新取り込み月"
          value={latestMonth === '—' ? '—' : `${latestMonth.replace('-', '年')}月`}
          sub={latestMonth === '—' ? undefined : toReiwa(parseInt(latestMonth.split('-')[0]))}
          color="blue"
        />
        <SummaryCard
          icon={<BookOpen className="w-5 h-5" />}
          label="仕訳件数（全期間）"
          value={fmt(totalTransactions) + '件'}
          color="violet"
        />
        <SummaryCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="残高不一致"
          value={unbalancedCount === 0 ? '0件 ✓' : `${unbalancedCount}件`}
          color={unbalancedCount === 0 ? 'emerald' : 'amber'}
        />
      </div>

      {/* 年選択(プルダウン) + カレンダーグリッド */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm lg:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100 px-4 py-4 lg:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-base font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5 cursor-pointer outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}年（{toReiwa(y)}）</option>
              ))}
            </select>
            <span className="text-sm text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200">
              {yearImportedCount}/12ヶ月 取り込み済み
            </span>
            {yearTotalTransactions > 0 && (
              <span className="text-sm text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200">
                仕訳 {fmt(yearTotalTransactions)}件
              </span>
            )}
          </div>
        </div>
        <div className="p-3 sm:p-4 lg:p-6">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-12">
            {yearMonths.map(({ key, label, data }) => (
              <MonthCell
                key={key}
                month={key}
                label={label}
                data={data}
                onView={() => navigateToMonth(key)}
                onImport={() => router.push('/finance/general-ledger/import')}
              />
            ))}
          </div>

          {/* 決算確認セクション */}
          <div className="px-0 pb-3 pt-4 lg:px-6 lg:pb-6 lg:pt-2">
            <div className="flex flex-wrap items-center gap-3">
              {closingLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> 決算データ確認中...
                </div>
              ) : closingCount > 0 ? (
                <>
                  <button
                    onClick={() => router.push(`/finance/trial-balance?month=${selectedYear}-07`)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-medium rounded-xl shadow-sm hover:shadow-md hover:scale-[1.02] transition-all"
                  >
                    <ClipboardList className="w-4 h-4" />
                    決算確認（{closingCount}件）
                  </button>
                  <button
                    onClick={() => window.location.href = `/finance/general-ledger-detail?month=${selectedYear}-07`}
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100 transition"
                  >
                    <BookOpen className="w-3.5 h-3.5" /> 決算仕訳一覧
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <ClipboardList className="w-4 h-4" />
                  決算データなし
                  <button
                    onClick={() => router.push('/finance/general-ledger/closing-import')}
                    className="ml-2 text-xs text-blue-500 hover:text-blue-700 hover:underline"
                  >
                    インポート →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 詳細テーブル */}
      {yearMonths.some(m => m.data) && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:rounded-2xl">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 lg:px-6">
            <h3 className="font-semibold text-slate-700">{selectedYear}年 <span className="text-xs font-normal text-slate-400">（{toReiwa(selectedYear)}）</span>— 月別データサマリー</h3>
          </div>
          <div className="overflow-x-auto overscroll-contain">
            <table className="min-w-[760px] w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">月</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">科目数</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">仕訳件数</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">借方合計</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">貸方合計</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">残高一致</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {yearMonths.map(({ key, label, data }) => {
                  if (!data) {
                    return (
                      <tr key={key} className="border-b border-slate-100 bg-slate-50/30">
                        <td className="px-4 py-3 text-slate-400">{label}</td>
                        <td colSpan={5} className="px-4 py-3 text-center text-slate-400 text-xs">未取り込み</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => router.push('/finance/general-ledger/import')}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            <Upload className="w-3 h-3" /> インポート
                          </button>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={key} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">{label}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{data.accountCount}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmt(data.transactionCount)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">¥{fmt(data.totalDebit)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">¥{fmt(data.totalCredit)}</td>
                      <td className="px-4 py-3 text-center">
                        {data.isBalanced ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => navigateToMonth(key)}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                            title="損益分析を表示"
                          >
                            <ExternalLink className="w-3 h-3" /> 詳細
                          </button>
                          <button
                            onClick={() => openDeleteDialog(key)}
                            className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:underline"
                            title="このデータを削除"
                          >
                            <Trash2 className="w-3 h-3" /> 削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 削除確認ダイアログ */}
      <dialog
        ref={dialogRef}
        className="m-3 w-[calc(100%-1.5rem)] max-w-md rounded-lg border-0 p-0 shadow-2xl backdrop:bg-black/50 lg:m-auto lg:w-full lg:rounded-2xl"
        onClose={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}
      >
        {deleteTarget && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">データの削除</h3>
                <p className="text-sm text-slate-500">
                  {deleteTarget.replace('-', '年')}月のデータを完全に削除します
                </p>
              </div>
            </div>

            {/* 削除対象の情報 */}
            {(() => {
              const d = monthMap.get(deleteTarget);
              if (!d) return null;
              return (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-slate-600">科目数:</div>
                    <div className="font-medium text-right">{d.accountCount}</div>
                    <div className="text-slate-600">仕訳件数:</div>
                    <div className="font-medium text-right">{fmt(d.transactionCount)}件</div>
                    <div className="text-slate-600">借方合計:</div>
                    <div className="font-medium text-right">¥{fmt(d.totalDebit)}</div>
                    <div className="text-slate-600">貸方合計:</div>
                    <div className="font-medium text-right">¥{fmt(d.totalCredit)}</div>
                  </div>
                </div>
              );
            })()}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
              <p className="font-bold mb-1">⚠️ この操作は取り消せません</p>
              <p>仕訳データと月次残高データの両方が完全に削除されます。</p>
            </div>

            <div className="mb-4">
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                確認のため「<span className="font-bold text-red-600">{deleteTarget}</span>」と入力してください
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteTarget}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={closeDeleteDialog}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
              >
                キャンセル
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || deleteConfirmText !== deleteTarget}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                削除を実行
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

// ------- Sub-components -------

const signalToneMap: Record<SignalTone, {
  panel: string;
  icon: string;
  value: string;
  badge: string;
  decision: string;
}> = {
  emerald: {
    panel: 'border-emerald-200 bg-emerald-50/70',
    icon: 'bg-emerald-100 text-emerald-700',
    value: 'text-emerald-700',
    badge: 'border-emerald-200 bg-emerald-100 text-emerald-700',
    decision: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  },
  amber: {
    panel: 'border-amber-200 bg-amber-50/70',
    icon: 'bg-amber-100 text-amber-700',
    value: 'text-amber-700',
    badge: 'border-amber-200 bg-amber-100 text-amber-700',
    decision: 'border-amber-200 bg-amber-50 text-amber-950',
  },
  rose: {
    panel: 'border-rose-200 bg-rose-50/70',
    icon: 'bg-rose-100 text-rose-700',
    value: 'text-rose-700',
    badge: 'border-rose-200 bg-rose-100 text-rose-700',
    decision: 'border-rose-200 bg-rose-50 text-rose-950',
  },
  blue: {
    panel: 'border-blue-200 bg-blue-50/70',
    icon: 'bg-blue-100 text-blue-700',
    value: 'text-blue-700',
    badge: 'border-blue-200 bg-blue-100 text-blue-700',
    decision: 'border-blue-200 bg-blue-50 text-blue-950',
  },
  slate: {
    panel: 'border-slate-200 bg-slate-50/80',
    icon: 'bg-slate-100 text-slate-600',
    value: 'text-slate-800',
    badge: 'border-slate-200 bg-white text-slate-600',
    decision: 'border-slate-200 bg-slate-50 text-slate-900',
  },
};

function BusinessSignalPanel({
  data,
  loading,
}: {
  data: FinanceInsightResponse | null;
  loading: boolean;
}) {
  const router = useRouter();

  const signal = useMemo(() => {
    const summary = data?.summary;
    if (!summary) return null;

    const sales = summary.netSales || 0;
    const grossProfit = summary.grossProfit || 0;
    const grossMargin = summary.grossMargin || (sales > 0 ? grossProfit / sales : 0);
    const operatingIncome = summary.operatingIncome || 0;
    const sgna = summary.sellingGeneralAdministrativeExpenses || Math.max(0, grossProfit - operatingIncome);
    const breakEvenSales = grossMargin > 0 ? sgna / grossMargin : 0;
    const salesBuffer = sales - breakEvenSales;
    const additionalSalesToBreakEven = operatingIncome < 0 && grossMargin > 0
      ? Math.abs(operatingIncome) / grossMargin
      : 0;
    const sgnaRatio = sales > 0 ? sgna / sales : 0;
    const equityRatio = summary.totalAssets ? summary.totalEquity / summary.totalAssets : 0;
    const personnelCost = summary.personnelCost || 0;
    const advertisingCost = summary.advertisingCost || 0;
    const paymentFees = summary.paymentFees || 0;
    const commerceCost = advertisingCost + paymentFees;
    const commerceCostRatio = sales > 0 ? commerceCost / sales : 0;

    let title = '今期累計の財務状態を確認';
    let body = '期首から最新入力月までの損益と、最新月末の貸借対照表をまとめています。';
    let tone: SignalTone = 'slate';

    if (sales <= 0) {
      title = '今期売上データの確認が必要';
      body = '累計売上がゼロまたは未取得のため、粗利率と損益分岐点を判定できません。';
      tone = 'amber';
    } else if (operatingIncome >= 0 && grossMargin >= 0.475) {
      title = '今期は本業黒字、粗利も目標水準';
      body = '累計粗利で販管費を吸収できています。47.5%前後の粗利率を崩さず、利益が残る売上を伸ばせる状態です。';
      tone = 'emerald';
    } else if (operatingIncome >= 0) {
      title = '今期は本業黒字、粗利率を守る';
      body = '営業黒字ですが、粗利率が下がると販管費を吸収しにくくなります。値引き・仕入・モール手数料を含めた採算管理が必要です。';
      tone = 'blue';
    } else if (grossMargin < 0.45) {
      title = '今期累計は原価負担が重く営業赤字';
      body = '売上増だけではなく、仕入原価・値引き・販売手数料を商品や販路ごとに見直し、まず粗利率を引き上げる必要があります。';
      tone = 'rose';
    } else {
      title = '粗利はあるが販管費を吸収できていない';
      body = '粗利率は一定水準にありますが、累計粗利が人件費などの販管費を賄えていません。費目別の固定費と一時費用を切り分けます。';
      tone = 'rose';
    }

    return {
      sales,
      grossProfit,
      grossMargin,
      operatingIncome,
      operatingMargin: summary.operatingMargin || (sales > 0 ? operatingIncome / sales : 0),
      ordinaryIncome: summary.ordinaryIncome || 0,
      ordinaryMargin: summary.ordinaryMargin || 0,
      netIncome: summary.netIncome || 0,
      netMargin: summary.netMargin || 0,
      personnelCost,
      personnelRatio: summary.personnelRatio || (sales > 0 ? personnelCost / sales : 0),
      advertisingCost,
      advertisingRatio: summary.advertisingRatio || (sales > 0 ? advertisingCost / sales : 0),
      paymentFees,
      paymentFeeRatio: summary.paymentFeeRatio || (sales > 0 ? paymentFees / sales : 0),
      depreciation: summary.depreciation || 0,
      depreciationRatio: summary.depreciationRatio || 0,
      interestExpense: summary.interestExpense || 0,
      cashAndDeposits: summary.cashAndDeposits || 0,
      inventory: summary.inventory || 0,
      totalAssets: summary.totalAssets || 0,
      totalLiabilities: summary.totalLiabilities || 0,
      totalEquity: summary.totalEquity || 0,
      interestBearingDebt: summary.interestBearingDebt || summary.longTermDebt || 0,
      latestSales: summary.currentNetSales || 0,
      latestOperatingIncome: summary.currentOperatingIncome || 0,
      sgna,
      sgnaRatio,
      breakEvenSales,
      salesBuffer,
      additionalSalesToBreakEven,
      equityRatio,
      commerceCost,
      commerceCostRatio,
      title,
      body,
      tone,
      expenseAccounts: data?.insights?.cumulativeExpenseAccounts?.slice(0, 6) || [],
    };
  }, [data]);

  if (loading && !signal) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          今期累計の経営状況を読み込み中
        </div>
      </section>
    );
  }

  if (!signal) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold text-emerald-700">経営シグナル</div>
            <h2 className="mt-1 text-xl font-bold text-slate-900">今期累計を計算できる試算表データがありません</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              合計残高試算表を取り込むと、今期累計の売上・粗利・販管費・利益と、最新時点の現預金・借入・在庫をここに表示します。
            </p>
          </div>
          <button
            onClick={() => router.push('/finance/trial-balance-statement/import')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <Upload className="h-4 w-4" />
            試算表を取り込む
          </button>
        </div>
      </section>
    );
  }

  const decisionClass = signalToneMap[signal.tone].decision;
  const grossTone: SignalTone = signal.grossMargin >= 0.475 ? 'emerald' : signal.grossMargin >= 0.45 ? 'amber' : 'rose';
  const profitTone: SignalTone = signal.operatingIncome >= 0 ? 'emerald' : 'rose';
  const personnelTone: SignalTone = signal.personnelRatio >= 0.25 ? 'rose' : signal.personnelRatio >= 0.2 ? 'amber' : 'slate';
  const commerceTone: SignalTone = signal.commerceCostRatio >= 0.1 ? 'rose' : signal.commerceCostRatio >= 0.07 ? 'amber' : 'slate';
  const equityTone: SignalTone = signal.totalEquity < 0 ? 'rose' : signal.equityRatio < 0.15 ? 'amber' : 'slate';
  const monthQuery = data?.month ? `?month=${data.month}` : '';
  const fiscalPeriod = getFiscalPeriod(data?.month, data?.months);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:rounded-2xl">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-4 lg:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-700">
              <Target className="h-4 w-4" />
              今期累計
              <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-emerald-700">
                {fiscalPeriod.label}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-500">
                入力済み {fiscalPeriod.importedCount}/{fiscalPeriod.elapsedMonths}か月
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-500">
                最新入力 {formatMonth(data?.month)}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-bold leading-7 text-slate-900 sm:text-xl">{signal.title}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-600">{signal.body}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              onClick={() => router.push(`/finance/trial-balance${monthQuery}`)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
            >
              損益分析へ
              <ArrowUpRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => router.push(`/finance/trial-balance-statement${monthQuery}`)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              試算表で確認
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="p-3 sm:p-4 lg:p-5">
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm leading-6 ${decisionClass}`}>
            累計売上{yen(signal.sales)}、粗利率{percent(signal.grossMargin)}、販管費{yen(signal.sgna)}、営業利益{yen(signal.operatingIncome)}。
            {signal.operatingIncome >= 0
              ? ` 現在の粗利率での損益分岐売上${yen(signal.breakEvenSales)}を、${yen(Math.max(0, signal.salesBuffer))}上回っています。`
              : signal.grossMargin > 0
                ? ` 現在の粗利率のままなら、営業赤字解消には追加売上${yen(signal.additionalSalesToBreakEven)}相当が必要です。`
                : ' 粗利がないため、売上追加だけでは赤字を解消できません。'}
          </div>

          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <SignalMetric icon={<BarChart3 className="h-4 w-4" />} label="累計売上" value={yen(signal.sales)} sub={`最新月 ${yen(signal.latestSales)}`} tone="blue" />
            <SignalMetric icon={<Gauge className="h-4 w-4" />} label="粗利率" value={percent(signal.grossMargin)} sub={`累計粗利 ${yen(signal.grossProfit)}`} tone={grossTone} />
            <SignalMetric icon={<Target className="h-4 w-4" />} label="累計販管費" value={yen(signal.sgna)} sub={`売上比 ${percent(signal.sgnaRatio)}`} tone="slate" />
            <SignalMetric icon={<TrendingUp className="h-4 w-4" />} label="営業利益" value={yen(signal.operatingIncome)} sub={`利益率 ${percent(signal.operatingMargin)}`} tone={profitTone} />
            <SignalMetric icon={<BookOpen className="h-4 w-4" />} label="経常利益" value={yen(signal.ordinaryIncome)} sub={`支払利息 ${yen(signal.interestExpense)}`} tone={signal.ordinaryIncome >= 0 ? 'emerald' : 'rose'} />
            <SignalMetric icon={<Scale className="h-4 w-4" />} label="当期純利益" value={yen(signal.netIncome)} sub={`利益率 ${percent(signal.netMargin)}`} tone={signal.netIncome >= 0 ? 'emerald' : 'rose'} />
          </div>

          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold text-slate-500">最新入力月末の資金・負債スナップショット</div>
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:gap-3 lg:grid-cols-4">
              <SignalMetric icon={<Wallet className="h-4 w-4" />} label="現預金" value={yen(signal.cashAndDeposits)} sub="現金及び預金" tone="blue" />
              <SignalMetric icon={<Package className="h-4 w-4" />} label="棚卸資産" value={yen(signal.inventory)} sub="試算表の月末残高" tone="amber" />
              <SignalMetric icon={<Landmark className="h-4 w-4" />} label="借入・リース" value={yen(signal.interestBearingDebt)} sub="長期・役員・リース合計" tone={signal.interestBearingDebt > signal.cashAndDeposits * 3 ? 'amber' : 'slate'} />
              <SignalMetric icon={<Scale className="h-4 w-4" />} label="純資産" value={yen(signal.totalEquity)} sub={`自己資本比率 ${percent(signal.equityRatio)}`} tone={equityTone} />
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:gap-3 lg:grid-cols-3">
            <SignalGuard
              label="人件費負担"
              value={percent(signal.personnelRatio)}
              body={`今期累計 ${yen(signal.personnelCost)}。役員報酬・給与・賞与・法定福利費等を含みます。`}
              tone={personnelTone}
            />
            <SignalGuard
              label="広告・販売手数料"
              value={percent(signal.commerceCostRatio)}
              body={`広告 ${yen(signal.advertisingCost)}、支払手数料 ${yen(signal.paymentFees)}。`}
              tone={commerceTone}
            />
            <SignalGuard
              label="財務体質"
              value={signal.totalEquity < 0 ? '債務超過' : percent(signal.equityRatio)}
              body={`総資産 ${yen(signal.totalAssets)}、負債 ${yen(signal.totalLiabilities)}。`}
              tone={equityTone}
            />
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 p-4 lg:border-l lg:border-t-0 lg:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-slate-500">今期累計 費用トップ</div>
              <div className="text-sm font-bold text-slate-900">利益を削る費目を見る</div>
            </div>
          </div>
          <div className="space-y-2">
            {signal.expenseAccounts.length > 0 ? signal.expenseAccounts.map((account) => (
              <div key={account.accountCode} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800" title={`${account.accountCode} ${account.accountName}`}>
                      {account.accountName}
                    </div>
                    <div className="text-xs text-slate-500">{account.accountCode} / 売上比 {percent(account.ratioToSales)}</div>
                  </div>
                  <div className="shrink-0 text-right text-sm font-bold text-slate-900 tabular-nums">
                    {yen(account.amount)}
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                費目データがまだありません。
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SignalMetric({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: SignalTone;
}) {
  const c = signalToneMap[tone];
  return (
    <div className={`min-w-0 rounded-lg border p-3 lg:rounded-xl ${c.panel}`}>
      <div className="mb-2 flex items-center gap-2">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${c.icon}`}>
          {icon}
        </div>
        <div className="min-w-0 truncate text-xs font-semibold text-slate-500">{label}</div>
      </div>
      <div className={`text-base font-bold leading-tight tabular-nums [overflow-wrap:anywhere] sm:text-lg ${c.value}`}>{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">{sub}</div>
    </div>
  );
}

function SignalGuard({
  label,
  value,
  body,
  tone,
}: {
  label: string;
  value: string;
  body: string;
  tone: SignalTone;
}) {
  const c = signalToneMap[tone];
  return (
    <div className={`rounded-lg border px-3 py-3 lg:rounded-xl ${c.panel}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        <div className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${c.badge}`}>{value}</div>
      </div>
      <div className="mt-2 text-xs leading-5 text-slate-600">{body}</div>
    </div>
  );
}

function SummaryCard({
  icon, label, value, color, sub,
}: {
  icon: React.ReactNode; label: string; value: string; color: string; sub?: string;
}) {
  const colorMap: Record<string, { bg: string; iconBg: string; text: string }> = {
    emerald: { bg: 'bg-emerald-50', iconBg: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-700' },
    blue: { bg: 'bg-blue-50', iconBg: 'bg-blue-100 text-blue-600', text: 'text-blue-700' },
    violet: { bg: 'bg-violet-50', iconBg: 'bg-violet-100 text-violet-600', text: 'text-violet-700' },
    amber: { bg: 'bg-amber-50', iconBg: 'bg-amber-100 text-amber-600', text: 'text-amber-700' },
  };
  const c = colorMap[color] || colorMap.emerald;

  return (
    <div className={`rounded-lg ${c.bg} border border-white/60 p-3 sm:p-4 lg:rounded-2xl`}>
      <div className={`w-9 h-9 rounded-xl ${c.iconBg} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-base font-bold [overflow-wrap:anywhere] sm:text-lg ${c.text}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function MonthCell({
  month, label, data, onView, onImport,
}: {
  month: string; label: string; data: MonthStatus | null;
  onView: () => void; onImport: () => void;
}) {
  const now = new Date();
  const [y, m] = month.split('-').map(Number);
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
  const isFuture = new Date(y, m - 1) > now;

  if (isFuture) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center opacity-40">
        <div className="text-xs font-medium text-slate-400 mb-1">{label}</div>
        <div className="text-[10px] text-slate-300">—</div>
      </div>
    );
  }

  if (!data) {
    return (
      <button
        onClick={onImport}
        className={`rounded-xl border-2 border-dashed p-3 text-center transition-all hover:border-amber-400 hover:bg-amber-50 group ${
          isCurrentMonth ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200'
        }`}
      >
        <div className={`text-xs font-bold mb-1 ${isCurrentMonth ? 'text-amber-600' : 'text-slate-500'}`}>
          {label}
        </div>
        <XCircle className={`w-5 h-5 mx-auto mb-1 ${isCurrentMonth ? 'text-amber-400' : 'text-slate-300'} group-hover:text-amber-500`} />
        <div className="text-[10px] text-slate-400 group-hover:text-amber-600">未取り込み</div>
      </button>
    );
  }

  return (
    <button
      onClick={onView}
      className={`w-full rounded-xl border-2 p-3 text-center transition-all hover:shadow-md hover:scale-[1.02] group ${
        isCurrentMonth
          ? 'border-emerald-400 bg-emerald-50 shadow-sm'
          : data.isBalanced
          ? 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50'
          : 'border-amber-300 bg-amber-50/30 hover:bg-amber-50'
      }`}
    >
      <div className={`text-xs font-bold mb-1 ${isCurrentMonth ? 'text-emerald-700' : 'text-slate-600'}`}>
        {label}
      </div>
      {data.isBalanced ? (
        <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
      ) : (
        <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-amber-500" />
      )}
      <div className="text-[10px] text-slate-500">{fmt(data.transactionCount)}件</div>
    </button>
  );
}

function QuickLink({
  icon, title, description, href, color,
}: {
  icon: React.ReactNode; title: string; description: string; href: string; color: string;
}) {
  const router = useRouter();
  const colorMap: Record<string, string> = {
    indigo: 'from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700',
    emerald: 'from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700',
    blue: 'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700',
    violet: 'from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700',
  };

  return (
    <button
      onClick={() => router.push(href)}
      className={`group min-h-[108px] rounded-lg bg-gradient-to-br p-3 text-left text-white transition-all hover:scale-[1.02] hover:shadow-lg sm:min-h-0 sm:p-5 lg:rounded-2xl ${colorMap[color]}`}
    >
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 transition group-hover:bg-white/30 sm:mb-3 sm:h-10 sm:w-10 sm:rounded-xl">
        {icon}
      </div>
      <div className="mb-1 text-sm font-semibold leading-5">{title}</div>
      <div className="hidden text-xs text-white/70 sm:block">{description}</div>
    </button>
  );
}
