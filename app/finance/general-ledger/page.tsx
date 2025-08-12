// /app/finance/general-ledger/page.tsx ver.12
'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { FileText, Upload, Trash2, TrendingUp, Search, Download } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import GeneralLedgerImportModal from '@/components/general-ledger/GeneralLedgerImportModal';

interface MonthlyData {
  report_month: string;
  account_count: number;
  transaction_count: number;
  total_debit: number;
  total_credit: number;
}

export default function GeneralLedgerPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedMonthData, setSelectedMonthData] = useState<MonthlyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const authStatus = sessionStorage.getItem('financeSystemAuth');
    if (authStatus === 'authenticated') {
      setIsAuthenticated(true);
      fetchMonthlyData();
    } else {
      setIsLoading(false);
    }
  }, []);

  // 選択された月が変更されたときの処理
  useEffect(() => {
    if (selectedMonth && monthlyData.length > 0) {
      const data = monthlyData.find(d => d.report_month === selectedMonth);
      setSelectedMonthData(data || null);
    }
  }, [selectedMonth, monthlyData]);

  const fetchMonthlyData = async () => {
    setIsLoading(true);
    try {
      // 月ごとの実際の取引件数を取得（general_ledgerから直接集計）
      const { data: monthList, error: monthError } = await supabase
        .from('general_ledger')
        .select('report_month')
        .order('report_month', { ascending: false });

      if (monthError) throw monthError;

      // 月のリストを作成
      const uniqueMonths = [...new Set(monthList?.map(item => item.report_month) || [])];
      
      console.log('取得した月のリスト:', uniqueMonths);
      
      const monthlyDataArray: MonthlyData[] = [];

      for (const month of uniqueMonths) {
        // general_ledgerから実際の取引件数を取得
        const { count: actualTransactionCount, error: countError } = await supabase
          .from('general_ledger')
          .select('*', { count: 'exact', head: true })
          .eq('report_month', month);

        // monthly_account_balanceから勘定科目数と金額合計を取得
        const { data: balanceData, error: balanceError } = await supabase
          .from('monthly_account_balance')
          .select('*')
          .eq('report_month', month);

        if (!balanceError && balanceData && balanceData.length > 0) {
          const accountCount = balanceData.length;
          const totalDebit = balanceData.reduce((sum, b) => sum + (b.total_debit || 0), 0);
          const totalCredit = balanceData.reduce((sum, b) => sum + (b.total_credit || 0), 0);

          monthlyDataArray.push({
            report_month: month,
            account_count: accountCount,
            transaction_count: actualTransactionCount || 0,
            total_debit: totalDebit,
            total_credit: totalCredit,
          });
        } else {
          // monthly_account_balanceにデータがない場合でも、general_ledgerにデータがあれば表示
          const { data: ledgerData, error: ledgerError } = await supabase
            .from('general_ledger')
            .select('account_code, debit_amount, credit_amount')
            .eq('report_month', month);

          if (!ledgerError && ledgerData && ledgerData.length > 0) {
            const uniqueAccounts = new Set(ledgerData.map(item => item.account_code));
            const totalDebit = ledgerData.reduce((sum, item) => sum + (item.debit_amount || 0), 0);
            const totalCredit = ledgerData.reduce((sum, item) => sum + (item.credit_amount || 0), 0);

            monthlyDataArray.push({
              report_month: month,
              account_count: uniqueAccounts.size,
              transaction_count: actualTransactionCount || 0,
              total_debit: totalDebit,
              total_credit: totalCredit,
            });
          }
        }
      }

      // 月でソート（降順）
      monthlyDataArray.sort((a, b) => b.report_month.localeCompare(a.report_month));
      
      console.log('処理後のデータ:', monthlyDataArray);
      
      setMonthlyData(monthlyDataArray);
      if (monthlyDataArray.length > 0) {
        // 最新の月を選択（存在する場合は現在の選択を維持）
        if (!selectedMonth || !monthlyDataArray.find(d => d.report_month === selectedMonth)) {
          setSelectedMonth(monthlyDataArray[0].report_month);
        }
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    
    try {
      const response = await fetch('/api/finance/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        sessionStorage.setItem('financeSystemAuth', 'authenticated');
        setIsAuthenticated(true);
        fetchMonthlyData();
      } else {
        setAuthError('パスワードが正しくありません');
      }
    } catch (error) {
      setAuthError('認証エラーが発生しました');
    }
  };

  const handleImportComplete = () => {
    // インポート完了後、自動的にデータを再取得して画面を更新
    console.log('インポート完了 - データを再取得します');
    fetchMonthlyData();
  };

  const handleDelete = async (month: string) => {
    if (!confirm(`${formatMonth(month)}のデータを削除してもよろしいですか？`)) return;

    try {
      const { error: ledgerError } = await supabase
        .from('general_ledger')
        .delete()
        .eq('report_month', month);

      if (ledgerError) throw ledgerError;

      const { error: balanceError } = await supabase
        .from('monthly_account_balance')
        .delete()
        .eq('report_month', month);

      if (balanceError) throw balanceError;

      // 削除後、自動的にデータを再取得
      alert(`${formatMonth(month)}のデータを削除しました`);
      fetchMonthlyData();
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  const handleExport = () => {
    alert('エクスポート機能は準備中です');
  };

  const handleAiQuery = async () => {
    if (!aiQuestion.trim() || !selectedMonth) return;

    setIsAiLoading(true);
    setAiResponse('');

    try {
      const response = await fetch('/api/finance/ai-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: aiQuestion,
          reportMonth: selectedMonth,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setAiResponse(data.response);
      } else {
        setAiResponse('エラー: ' + data.error);
      }
    } catch (error) {
      setAiResponse('エラーが発生しました');
    } finally {
      setIsAiLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(amount);
  };

  const formatMonth = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">財務分析システム</h1>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                管理者パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-2 border rounded-md"
                required
              />
            </div>
            {authError && (
              <p className="text-red-500 text-sm">{authError}</p>
            )}
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
            >
              ログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">財務分析システム</h1>
        <p className="text-gray-600">会計データの管理と財務分析</p>
      </div>

      <div className="flex space-x-1 mb-6">
        <Link
          href="/finance/general-ledger"
          className="px-4 py-2 bg-blue-600 text-white rounded-md flex items-center"
        >
          <FileText className="h-4 w-4 mr-2" />
          総勘定元帳
        </Link>
        <Link
          href="/finance/financial-statements"
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center"
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          財務諸表
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">データ管理</h2>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
            >
              <Upload className="h-4 w-4 mr-2" />
              CSVインポート
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              対象月
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full md:w-64 p-2 border rounded-md"
              disabled={monthlyData.length === 0}
            >
              {monthlyData.length === 0 ? (
                <option value="">データがありません</option>
              ) : (
                monthlyData.map((data) => (
                  <option key={data.report_month} value={data.report_month}>
                    {formatMonth(data.report_month)}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">対象月</th>
                  <th className="text-right py-2 px-3">勘定科目数</th>
                  <th className="text-right py-2 px-3">取引件数</th>
                  <th className="text-right py-2 px-3">借方合計</th>
                  <th className="text-right py-2 px-3">貸方合計</th>
                  <th className="text-center py-2 px-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4">
                      読み込み中...
                    </td>
                  </tr>
                ) : selectedMonthData ? (
                  <tr className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{formatMonth(selectedMonthData.report_month)}</td>
                    <td className="text-right py-2 px-3">{selectedMonthData.account_count}</td>
                    <td className="text-right py-2 px-3">{selectedMonthData.transaction_count.toLocaleString()}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(selectedMonthData.total_debit)}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(selectedMonthData.total_credit)}</td>
                    <td className="text-center py-2 px-3">
                      <button
                        onClick={() => handleDelete(selectedMonthData.report_month)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-gray-500">
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 全月データ一覧（デバッグ用に一時的に表示） */}
          <div className="mt-4 text-xs text-gray-500">
            <p>登録済みの月: {monthlyData.map(d => formatMonth(d.report_month)).join(', ')}</p>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleExport}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center"
            >
              <Download className="h-4 w-4 mr-2" />
              エクスポート
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-blue-50 rounded-lg shadow p-6">
        <div className="flex items-center mb-4">
          <Search className="h-5 w-5 text-blue-600 mr-2" />
          <h3 className="text-lg font-semibold">AI分析アシスタント</h3>
        </div>
        <div className="space-y-4">
          <input
            type="text"
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAiQuery()}
            placeholder="例: 今月の広告費の詳細を教えて / 電気代の合計は？"
            className="w-full p-3 border rounded-md"
            disabled={isAiLoading || !selectedMonth}
          />
          <button
            onClick={handleAiQuery}
            disabled={isAiLoading || !aiQuestion.trim() || !selectedMonth}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isAiLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                分析中...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                質問する
              </>
            )}
          </button>
          {aiResponse && (
            <div className="bg-white p-4 rounded-md border">
              <pre className="whitespace-pre-wrap text-sm">{aiResponse}</pre>
            </div>
          )}
        </div>
      </div>

      <GeneralLedgerImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}
