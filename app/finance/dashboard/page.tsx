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

// --- Helpers ---
function fmt(n: number): string {
  return n.toLocaleString('ja-JP');
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
    <div className="p-6 space-y-8 max-w-[1400px] mx-auto">
      {/* ヘッダー + 月選択ジャンプ */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Scale className="w-5 h-5 text-white" />
            </div>
            財務分析ダッシュボード
          </h1>
          <p className="text-sm text-slate-500 mt-1 ml-[52px]">
            仕訳データの取り込み状況と財務サマリーを一覧で確認
          </p>
        </div>
        {/* インポートボタン */}
        <button
          onClick={() => router.push('/finance/general-ledger/import')}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition shadow-sm"
        >
          <Upload className="w-4 h-4" />
          インポート
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      )}

      {/* サマリーカード */}
      {/* 検索バー */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 flex items-center gap-3">
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
                <div className="px-5 py-2 text-xs text-slate-500 bg-slate-50 flex items-center justify-between">
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
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
          <div className="flex items-center gap-2">
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
        <div className="p-6">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-3">
            {yearMonths.map(({ key, label, data }) => (
              <MonthCell
                key={key}
                month={key}
                label={label}
                data={data}
                onView={() => navigateToMonth(key)}
                onImport={() => router.push('/finance/general-ledger/import')}
                onDelete={() => openDeleteDialog(key)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 詳細テーブル */}
      {yearMonths.some(m => m.data) && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-semibold text-slate-700">{selectedYear}年 <span className="text-xs font-normal text-slate-400">（{toReiwa(selectedYear)}）</span>— 月別データサマリー</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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

      {/* クイックリンク */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickLink icon={<BarChart3 className="w-5 h-5" />} title="損益分析ビューアー" description="科目別の収支とAIコスト分析" href="/finance/trial-balance" color="indigo" />
        <QuickLink icon={<TrendingUp className="w-5 h-5" />} title="財務概要" description="BS・PL合計とバランスチェック" href="/finance/overview" color="emerald" />
        <QuickLink icon={<Upload className="w-5 h-5" />} title="仕訳CSVインポート" description="月次仕訳データの取り込み" href="/finance/general-ledger/import" color="blue" />
        <QuickLink icon={<FileSpreadsheet className="w-5 h-5" />} title="決算仕訳インポート" description="決算整理仕訳の取り込み" href="/finance/general-ledger/closing-import" color="violet" />
      </div>

      {/* 削除確認ダイアログ */}
      <dialog
        ref={dialogRef}
        className="p-0 rounded-2xl shadow-2xl border-0 backdrop:bg-black/50 max-w-md w-full"
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
    <div className={`rounded-2xl ${c.bg} p-4 border border-white/60`}>
      <div className={`w-9 h-9 rounded-xl ${c.iconBg} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${c.text}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function MonthCell({
  month, label, data, onView, onImport, onDelete,
}: {
  month: string; label: string; data: MonthStatus | null;
  onView: () => void; onImport: () => void; onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const [y, m] = month.split('-').map(Number);
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
  const isFuture = new Date(y, m - 1) > now;

  // クリック外でメニュー閉じる
  useEffect(() => {
    if (!showMenu) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

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
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
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

      {/* ポップオーバーメニュー */}
      {showMenu && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[140px]">
          <button
            onClick={() => { setShowMenu(false); onView(); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" /> 損益分析を開く
          </button>
          <button
            onClick={() => { setShowMenu(false); onImport(); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
          >
            <Upload className="w-3.5 h-3.5" /> 再インポート
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button
            onClick={() => { setShowMenu(false); onDelete(); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 transition"
          >
            <Trash2 className="w-3.5 h-3.5" /> データ削除
          </button>
        </div>
      )}
    </div>
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
      className={`rounded-2xl bg-gradient-to-br ${colorMap[color]} text-white p-5 text-left transition-all hover:shadow-lg hover:scale-[1.02] group`}
    >
      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3 group-hover:bg-white/30 transition">
        {icon}
      </div>
      <div className="font-semibold text-sm mb-1">{title}</div>
      <div className="text-xs text-white/70">{description}</div>
    </button>
  );
}
