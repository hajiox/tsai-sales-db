// ver.1 (2025-08-19 JST) - extracted browser-only GL detail client
'use client';

import { useState, useEffect, useMemo } from 'react';
import getSupabase from '@/lib/supabaseClient';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Search, MessageSquare, FileText, TrendingUp, Filter, Send, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function ClientGLDetail() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // データ関連の状態
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accountMaster, setAccountMaster] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('2025-02');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dataLoading, setDataLoading] = useState(false);

  // AI質問機能の状態
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [queryHistory, setQueryHistory] = useState<Array<{question: string, response: string}>>([]);

  const supabase = useMemo(
    () => (typeof window !== 'undefined' ? getSupabase() : null),
    []
  );

  const itemsPerPage = 50;

  // 認証チェック
  useEffect(() => {
    const authStatus = sessionStorage.getItem('financeAuthenticated');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
      loadAccountMaster();
      loadTransactions();
    }
  }, []);

  // パスワード認証
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/finance/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        sessionStorage.setItem('financeAuthenticated', 'true');
        setIsAuthenticated(true);
        loadAccountMaster();
        loadTransactions();
      } else {
        setError('パスワードが正しくありません');
      }
    } catch (err) {
      setError('認証エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 勘定科目マスタ読み込み
  const loadAccountMaster = async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('account_master')
      .select('account_code, account_name')
      .order('account_code');
    
    if (data) {
      setAccountMaster(data);
    }
  };

  // 取引データ読み込み
  const loadTransactions = async () => {
    if (!supabase) return;
    setDataLoading(true);

    let query = supabase
      .from('general_ledger')
      .select(`
        *,
        account_master!inner(account_name)
      `, { count: 'exact' })
      .eq('report_month', `${selectedMonth}-01`)
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true });

    // フィルタ条件追加
    if (selectedAccount) {
      query = query.eq('account_code', selectedAccount);
    }
    
    if (searchTerm) {
      query = query.or(`description.ilike.%${searchTerm}%,counter_account.ilike.%${searchTerm}%`);
    }

    // ページネーション
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (data) {
      setTransactions(data);
      setTotalPages(Math.ceil((count || 0) / itemsPerPage));
    }
    
    setDataLoading(false);
  };

  // AI質問処理
  const handleAiQuestion = async () => {
    if (!aiQuestion.trim()) return;
    
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
        setQueryHistory(prev => [...prev, { question: aiQuestion, response: data.response }]);
      } else {
        setAiResponse(`エラー: ${data.error}`);
      }
    } catch (err) {
      setAiResponse('質問の処理中にエラーが発生しました');
    } finally {
      setAiLoading(false);
    }
  };

  // 検索・フィルタ変更時の処理
  useEffect(() => {
    if (isAuthenticated) {
      setCurrentPage(1);
      loadTransactions();
    }
  }, [selectedMonth, selectedAccount, searchTerm]);

  useEffect(() => {
    if (isAuthenticated) {
      loadTransactions();
    }
  }, [currentPage]);

  // 認証前画面
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="w-full max-w-md p-8 space-y-4 bg-white rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-center">財務分析システム - 詳細検索</h2>
          <p className="text-sm text-gray-600 text-center">管理者パスワードを入力してください</p>
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded">{error}</div>
          )}
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="パスワード"
              required
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // メイン画面
  return (
    <div className="p-8">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">総勘定元帳 詳細検索・AI分析</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/finance/general-ledger" className="text-blue-600 hover:text-blue-800">
            ← 総勘定元帳へ戻る
          </Link>
          <Link href="/finance/financial-statements" className="text-blue-600 hover:text-blue-800">
            財務諸表
          </Link>
        </div>
      </div>

      {/* 検索フィルタ */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">対象月</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              lang="ja"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">勘定科目</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="">全て</option>
              {accountMaster.map((acc) => (
                <option key={acc.account_code} value={acc.account_code}>
                  {acc.account_code} - {acc.account_name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">摘要・相手科目検索</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="検索キーワード"
                className="w-full px-3 py-2 pl-10 border rounded-lg"
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => { setSearchTerm(''); setSelectedAccount(''); }}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              クリア
            </button>
          </div>
        </div>
      </div>

      {/* AI質問ボックス */}
      <div className="bg-blue-50 rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
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
            className="flex-1 px-4 py-2 border rounded-lg"
            disabled={aiLoading}
          />
          <button
            onClick={handleAiQuestion}
            disabled={aiLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            {aiLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            質問
          </button>
        </div>
        
        {aiResponse && (
          <div className="bg-white rounded-lg p-4">
            <pre className="whitespace-pre-wrap text-sm">{aiResponse}</pre>
          </div>
        )}
      </div>

      {/* 取引明細テーブル */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">取引明細</h2>
        </div>
        
        {dataLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="animate-spin h-8 w-8 mx-auto text-blue-600" />
            <p className="mt-2 text-gray-600">データを読み込んでいます...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">日付</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">勘定科目</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">相手科目</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">摘要</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">借方</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">貸方</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">残高</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((trans, index) => (
                    <tr key={trans.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm">
                        {format(new Date(trans.transaction_date), 'MM/dd', { locale: ja })}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {trans.account_master?.account_name}
                      </td>
                      <td className="px-4 py-3 text-sm">{trans.counter_account}</td>
                      <td className="px-4 py-3 text-sm">{trans.description}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        {trans.debit_amount > 0 ? trans.debit_amount.toLocaleString() : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {trans.credit_amount > 0 ? trans.credit_amount.toLocaleString() : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {trans.balance?.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* ページネーション */}
            <div className="px-6 py-4 border-t flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {totalPages > 0 && `${currentPage} / ${totalPages} ページ`}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  前へ
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  次へ
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
