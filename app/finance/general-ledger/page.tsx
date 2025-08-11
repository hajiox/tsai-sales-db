// /app/finance/general-ledger/page.tsx ver.9 - AI質問機能追加版
'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { FileSpreadsheet, Upload, Calendar, Trash2, BarChart3, Lock, MessageSquare, Send, Loader2 } from 'lucide-react';
import GeneralLedgerImportModal from '@/components/general-ledger/GeneralLedgerImportModal';

interface MonthlySummary {
  report_month: string;
  account_count: number;
  transaction_count: number;
  total_debit: number;
  total_credit: number;
}

export default function GeneralLedgerPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlySummary[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // パスワード認証用のstate
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // AI質問機能の状態
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    // セッションストレージから認証状態を確認
    const authStatus = sessionStorage.getItem('financeSystemAuth');
    if (authStatus === 'authenticated') {
      setIsAuthenticated(true);
      fetchMonthlySummaries();
    } else {
      setIsLoading(false);
    }
  }, []);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    // APIでパスワード検証
    try {
      const response = await fetch('/api/finance/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        setIsAuthenticated(true);
        sessionStorage.setItem('financeSystemAuth', 'authenticated');
        fetchMonthlySummaries();
      } else {
        setPasswordError('パスワードが正しくありません');
      }
    } catch (error) {
      setPasswordError('認証エラーが発生しました');
    }
  };

  const fetchMonthlySummaries = async () => {
    try {
      const { data, error } = await supabase
        .from('monthly_account_balance')
        .select('report_month, account_code')
        .order('report_month', { ascending: false });

      if (error) throw error;

      // 月ごとに集計
      const summaryMap = new Map<string, MonthlySummary>();
      
      for (const row of data || []) {
        const month = row.report_month;
        if (!summaryMap.has(month)) {
          // 該当月の詳細データを取得
          const { data: monthData } = await supabase
            .from('monthly_account_balance')
            .select('*')
            .eq('report_month', month);

          const { data: transactionData } = await supabase
            .from('general_ledger')
            .select('*')
            .eq('report_month', month);

          summaryMap.set(month, {
            report_month: month,
            account_count: monthData?.length || 0,
            transaction_count: transactionData?.length || 0,
            total_debit: monthData?.reduce((sum, item) => sum + (item.total_debit || 0), 0) || 0,
            total_credit: monthData?.reduce((sum, item) => sum + (item.total_credit || 0), 0) || 0,
          });
        }
      }

      setMonthlySummaries(Array.from(summaryMap.values()));
      
      // 最新月を選択
      if (summaryMap.size > 0) {
        const months = Array.from(summaryMap.keys()).sort();
        setSelectedMonth(months[months.length - 1].substring(0, 7));
      }
    } catch (error) {
      console.error('Error fetching monthly summaries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportComplete = () => {
    setIsImportModalOpen(false);
    fetchMonthlySummaries();
  };

  const handleDeleteMonth = async (month: string) => {
    if (!confirm(`${month}のデータを削除してよろしいですか？\nこの操作は取り消せません。`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const { error: glError } = await supabase
        .from('general_ledger')
        .delete()
        .eq('report_month', month);

      if (glError) throw glError;

      const { error: mabError } = await supabase
        .from('monthly_account_balance')
        .delete()
        .eq('report_month', month);

      if (mabError) throw mabError;

      await fetchMonthlySummaries();
      alert('データを削除しました');
    } catch (error) {
      console.error('Error deleting data:', error);
      alert('削除中にエラーが発生しました');
    } finally {
      setIsDeleting(false);
    }
  };

  // AI質問処理
  const handleAiQuestion = async () => {
    if (!aiQuestion.trim() || !selectedMonth) return;
    
    setAiLoading(true);
    setAiResponse('');

    try {
      const response = await fetch('/api/finance/ai-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: aiQuestion,
          reportMonth: selectedMonth
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setAiResponse(data.response);
      } else {
        setAiResponse(`エラー: ${data.error}`);
      }
    } catch (err) {
      setAiResponse('質問の処理中にエラーが発生しました');
    } finally {
      setAiLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY'
    }).format(amount);
  };

  const formatMonth = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  };

  // パスワード認証画面
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div className="bg-white shadow-lg rounded-lg p-8">
            <div className="text-center mb-8">
              <Lock className="mx-auto h-12 w-12 text-gray-400" />
              <h2 className="mt-4 text-2xl font-bold text-gray-900">
                財務分析システム
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                管理者パスワードを入力してください
              </p>
            </div>
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div>
                <label htmlFor="password" className="sr-only">
                  パスワード
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="パスワード"
                />
              </div>
              {passwordError && (
                <div className="text-red-600 text-sm text-center">
                  {passwordError}
                </div>
              )}
              <button
                type="submit"
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                ログイン
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // 認証済みの場合は通常の画面を表示
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">財務分析システム</h1>
        <p className="text-gray-600">会計データの管理と財務分析</p>
      </div>

      {/* サブメニュー */}
      <div className="bg-gray-50 rounded-lg p-1 mb-6">
        <nav className="flex space-x-1">
          <button
            onClick={() => router.push('/finance/general-ledger')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              pathname === '/finance/general-ledger'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>総勘定元帳</span>
          </button>
          <button
            onClick={() => router.push('/finance/financial-statements')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              pathname === '/finance/financial-statements'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>財務諸表</span>
          </button>
        </nav>
      </div>

      {/* コントロールパネル */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">データ管理</h2>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>CSVインポート</span>
            </button>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                lang="ja"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 月次サマリーテーブル */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">月次データ一覧</h2>
          
          {isLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : monthlySummaries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              データがありません。CSVファイルをインポートしてください。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      対象月
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      勘定科目数
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      取引件数
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      借方合計
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      貸方合計
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {monthlySummaries.map((summary) => (
                    <tr key={summary.report_month} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatMonth(summary.report_month)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {summary.account_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {summary.transaction_count.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatCurrency(summary.total_debit)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatCurrency(summary.total_credit)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button
                          onClick={() => handleDeleteMonth(summary.report_month)}
                          disabled={isDeleting}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* AI質問ボックス */}
      <div className="bg-blue-50 rounded-lg shadow mb-6">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <MessageSquare className="mr-2 h-5 w-5" />
            AI分析アシスタント
          </h2>
          
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAiQuestion()}
              placeholder="例: 今月の広告費の詳細を教えて / 電気代の合計は？"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={aiLoading || !selectedMonth}
            />
            <button
              onClick={handleAiQuestion}
              disabled={aiLoading || !aiQuestion.trim() || !selectedMonth}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {aiLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              質問
            </button>
          </div>
          
          {!selectedMonth && (
            <p className="text-sm text-gray-500 mb-2">対象月を選択してください</p>
          )}
          
          {aiResponse && (
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800">{aiResponse}</pre>
            </div>
          )}
        </div>
      </div>

      {/* インポートモーダル */}
      {isImportModalOpen && (
        <GeneralLedgerImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportComplete={handleImportComplete}
        />
      )}
    </div>
  );
}
