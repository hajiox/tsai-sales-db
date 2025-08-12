// /app/finance/financial-statements/page.tsx ver.6
'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { FileSpreadsheet, BarChart3, TrendingUp, PieChart, Search, Filter, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface AccountBalance {
  account_code: string;
  account_name: string;
  balance: number;
}

interface TransactionDetail {
  id: string;
  transaction_date: string;
  account_code: string;
  account_name: string;
  counter_account: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  balance: number;
}

export default function FinancialStatementsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedMonth, setSelectedMonth] = useState('2025-02');
  const [activeTab, setActiveTab] = useState<'bs' | 'pl' | 'cf' | 'detail'>('bs');
  const [isLoading, setIsLoading] = useState(true);
  
  // 財務諸表データ
  const [bsData, setBsData] = useState<{
    assets: AccountBalance[];
    liabilities: AccountBalance[];
    equity: AccountBalance[];
  }>({ assets: [], liabilities: [], equity: [] });
  
  const [plData, setPlData] = useState<{
    revenues: AccountBalance[];
    expenses: AccountBalance[];
  }>({ revenues: [], expenses: [] });

  // 詳細検索用の状態
  const [transactions, setTransactions] = useState<TransactionDetail[]>([]);
  const [accountMaster, setAccountMaster] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dataLoading, setDataLoading] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const itemsPerPage = 50;

  useEffect(() => {
    const authStatus = sessionStorage.getItem('financeSystemAuth');
    if (authStatus === 'authenticated') {
      loadFinancialData();
      loadAccountMaster();
    } else {
      router.push('/finance/general-ledger');
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (activeTab === 'detail') {
      loadTransactions();
    }
  }, [activeTab, selectedMonth, selectedAccount, searchTerm, currentPage]);

  const loadAccountMaster = async () => {
    const { data, error } = await supabase
      .from('account_master')
      .select('account_code, account_name')
      .order('account_code');
    
    if (data) {
      setAccountMaster(data);
    }
  };

  const loadTransactions = async () => {
    if (activeTab !== 'detail') return;
    
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

    if (selectedAccount) {
      query = query.eq('account_code', selectedAccount);
    }
    
    if (searchTerm) {
      query = query.or(`description.ilike.%${searchTerm}%,counter_account.ilike.%${searchTerm}%`);
    }

    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (data) {
      const formattedData = data.map(item => ({
        ...item,
        account_name: item.account_master?.account_name || ''
      }));
      setTransactions(formattedData);
      setTotalPages(Math.ceil((count || 0) / itemsPerPage));
    }
    
    setDataLoading(false);
  };

  const loadFinancialData = async () => {
    setIsLoading(true);
    
    // Supabaseの1000件制限を回避するため、ページネーションで全件取得
    let allLedgerData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      
      const { data: ledgerData, error } = await supabase
        .from('general_ledger')
        .select(`
          account_code,
          debit_amount,
          credit_amount,
          account_master!inner(account_name)
        `)
        .eq('report_month', `${selectedMonth}-01`)
        .range(from, to);

      if (ledgerData && ledgerData.length > 0) {
        allLedgerData = [...allLedgerData, ...ledgerData];
        hasMore = ledgerData.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }

    console.log('取得したデータ件数（全件）:', allLedgerData.length);

    if (allLedgerData.length > 0) {
      const accountTotals = new Map<string, { name: string, debit: number, credit: number }>();
      
      // 勘定科目ごとに集計
      allLedgerData.forEach(item => {
        const code = item.account_code;
        const name = item.account_master?.account_name || '';
        
        if (!accountTotals.has(code)) {
          accountTotals.set(code, { name, debit: 0, credit: 0 });
        }
        
        const account = accountTotals.get(code)!;
        account.debit += item.debit_amount || 0;
        account.credit += item.credit_amount || 0;
      });

      const assets: AccountBalance[] = [];
      const liabilities: AccountBalance[] = [];
      const equity: AccountBalance[] = [];
      const revenues: AccountBalance[] = [];
      const expenses: AccountBalance[] = [];

      accountTotals.forEach((totals, code) => {
        let balance = 0;
        
        // 勘定科目コードによって借方・貸方の残高計算を変える
        if ((code >= '100' && code < '200') || // 資産
            (code >= '1000' && code < '1200') || // その他資産
            (code >= '400' && code < '600') || // 費用
            code === '610') { // 支払利息
          // 資産・費用は借方残高
          balance = totals.debit - totals.credit;
        } else {
          // 負債・純資産・収益は貸方残高
          balance = totals.credit - totals.debit;
        }

        const account: AccountBalance = {
          account_code: code,
          account_name: totals.name,
          balance: Math.abs(balance)
        };

        // 勘定科目の分類
        if ((code >= '100' && code < '200') || (code >= '1000' && code < '1200')) {
          assets.push(account);
        } else if ((code >= '200' && code < '300') || (code >= '1200' && code < '1300')) {
          liabilities.push(account);
        } else if (code >= '300' && code < '400') {
          equity.push(account);
        } else if ((code >= '800' && code < '900') || (code >= '600' && code < '610')) {
          revenues.push(account);
        } else if ((code >= '400' && code < '600') || code === '610') {
          expenses.push(account);
        }
        
        // リース関連の特殊処理
        if (code >= '3000' && code < '4000') {
          if (totals.name.includes('リース資産')) {
            assets.push(account);
          } else if (totals.name.includes('リース債務')) {
            liabilities.push(account);
          }
        }
      });

      // ソート
      assets.sort((a, b) => a.account_code.localeCompare(b.account_code));
      liabilities.sort((a, b) => a.account_code.localeCompare(b.account_code));
      equity.sort((a, b) => a.account_code.localeCompare(b.account_code));
      revenues.sort((a, b) => a.account_code.localeCompare(b.account_code));
      expenses.sort((a, b) => a.account_code.localeCompare(b.account_code));

      setBsData({ assets, liabilities, equity });
      setPlData({ revenues, expenses });
    }

    setIsLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY'
    }).format(amount);
  };

  const calculateTotal = (items: AccountBalance[]) => {
    return items.reduce((sum, item) => sum + item.balance, 0);
  };

  const renderBalanceSheet = () => {
    const totalAssets = calculateTotal(bsData.assets);
    const totalLiabilities = calculateTotal(bsData.liabilities);
    const totalEquity = calculateTotal(bsData.equity);
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

    return (
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-blue-700">資産の部</h3>
          <div className="space-y-2">
            {bsData.assets.map(item => (
              <div key={item.account_code} className="flex justify-between py-1 hover:bg-gray-50">
                <span className="text-sm">{item.account_name}</span>
                <span className="text-sm font-mono">{formatCurrency(item.balance)}</span>
              </div>
            ))}
            <div className="border-t pt-2 mt-4">
              <div className="flex justify-between font-semibold">
                <span>資産合計</span>
                <span className="font-mono">{formatCurrency(totalAssets)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-red-700">負債・純資産の部</h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2 text-gray-700">負債</h4>
              <div className="space-y-2 ml-4">
                {bsData.liabilities.map(item => (
                  <div key={item.account_code} className="flex justify-between py-1 hover:bg-gray-50">
                    <span className="text-sm">{item.account_name}</span>
                    <span className="text-sm font-mono">{formatCurrency(item.balance)}</span>
                  </div>
                ))}
                <div className="border-t pt-1">
                  <div className="flex justify-between font-medium">
                    <span>負債計</span>
                    <span className="font-mono">{formatCurrency(totalLiabilities)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2 text-gray-700">純資産</h4>
              <div className="space-y-2 ml-4">
                {bsData.equity.map(item => (
                  <div key={item.account_code} className="flex justify-between py-1 hover:bg-gray-50">
                    <span className="text-sm">{item.account_name}</span>
                    <span className="text-sm font-mono">{formatCurrency(item.balance)}</span>
                  </div>
                ))}
                <div className="border-t pt-1">
                  <div className="flex justify-between font-medium">
                    <span>純資産計</span>
                    <span className="font-mono">{formatCurrency(totalEquity)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-2">
              <div className="flex justify-between font-semibold">
                <span>負債・純資産合計</span>
                <span className="font-mono">{formatCurrency(totalLiabilitiesAndEquity)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderProfitLoss = () => {
    const totalRevenues = calculateTotal(plData.revenues);
    const totalExpenses = calculateTotal(plData.expenses);
    const netIncome = totalRevenues - totalExpenses;

    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">損益計算書</h3>
        
        <div className="space-y-6">
          <div>
            <h4 className="font-medium mb-3 text-green-700">収益</h4>
            <div className="space-y-2 ml-4">
              {plData.revenues.length === 0 ? (
                <div className="text-sm text-gray-500">データがありません</div>
              ) : (
                plData.revenues.map(item => (
                  <div key={item.account_code} className="flex justify-between py-1 hover:bg-gray-50">
                    <span className="text-sm">{item.account_name}</span>
                    <span className="text-sm font-mono">{formatCurrency(item.balance)}</span>
                  </div>
                ))
              )}
              <div className="border-t pt-2">
                <div className="flex justify-between font-medium">
                  <span>収益合計</span>
                  <span className="font-mono">{formatCurrency(totalRevenues)}</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-3 text-red-700">費用</h4>
            <div className="space-y-2 ml-4">
              {plData.expenses.length === 0 ? (
                <div className="text-sm text-gray-500">データがありません</div>
              ) : (
                plData.expenses.map(item => (
                  <div key={item.account_code} className="flex justify-between py-1 hover:bg-gray-50">
                    <span className="text-sm">{item.account_name}</span>
                    <span className="text-sm font-mono">{formatCurrency(item.balance)}</span>
                  </div>
                ))
              )}
              <div className="border-t pt-2">
                <div className="flex justify-between font-medium">
                  <span>費用合計</span>
                  <span className="font-mono">{formatCurrency(totalExpenses)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between text-lg font-bold">
              <span>当期純利益</span>
              <span className={`font-mono ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {netIncome >= 0 ? '' : '-'}{formatCurrency(Math.abs(netIncome))}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCashFlow = () => {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">キャッシュフロー計算書（簡易版）</h3>
        <div className="text-center py-8 text-gray-500">
          <TrendingUp className="mx-auto h-12 w-12 mb-4 text-gray-300" />
          <p>キャッシュフロー計算書は準備中です</p>
          <p className="text-sm mt-2">前期比較データの入力後に表示されます</p>
        </div>
      </div>
    );
  };

  const renderDetailSearch = () => {
    return (
      <div className="space-y-4">
        {/* 検索フィルタ */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">勘定科目</label>
              <select
                value={selectedAccount}
                onChange={(e) => {
                  setSelectedAccount(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="検索キーワード"
                  className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </div>
            
            <div className="flex items-end">
              <button
                onClick={() => { 
                  setSearchTerm(''); 
                  setSelectedAccount('');
                  setCurrentPage(1);
                }}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                クリア
              </button>
            </div>
          </div>
        </div>

        {/* 取引明細テーブル */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {dataLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-2 text-gray-600">データを読み込んでいます...</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日付</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">勘定科目</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">相手科目</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">摘要</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">借方</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">貸方</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">残高</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {transactions.map((trans) => (
                      <tr key={trans.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          {format(new Date(trans.transaction_date), 'MM/dd', { locale: ja })}
                        </td>
                        <td className="px-4 py-3 text-sm">{trans.account_name}</td>
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
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">財務分析システム</h1>
        <p className="text-gray-600">財務諸表と詳細分析</p>
      </div>

      {/* サブメニュー */}
      <div className="bg-gray-50 rounded-lg p-1 mb-6">
        <nav className="flex space-x-1">
          <button
            onClick={() => router.push('/finance/general-ledger')}
            className="flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>総勘定元帳</span>
          </button>
          <button
            onClick={() => router.push('/finance/financial-statements')}
            className="flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium bg-white text-blue-600 shadow-sm transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            <span>財務諸表</span>
          </button>
        </nav>
      </div>

      {/* 月選択とタブ */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
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
        
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('bs')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'bs'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            貸借対照表
          </button>
          <button
            onClick={() => setActiveTab('pl')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'pl'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            損益計算書
          </button>
          <button
            onClick={() => setActiveTab('cf')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'cf'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            キャッシュフロー計算書
          </button>
          <button
            onClick={() => setActiveTab('detail')}
            className={`px-6 py-3 text-sm font-medium flex items-center ${
              activeTab === 'detail'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Search className="w-4 h-4 mr-1" />
            詳細検索
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      <div>
        {isLoading && activeTab !== 'detail' ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <>
            {activeTab === 'bs' && renderBalanceSheet()}
            {activeTab === 'pl' && renderProfitLoss()}
            {activeTab === 'cf' && renderCashFlow()}
            {activeTab === 'detail' && renderDetailSearch()}
          </>
        )}
      </div>
    </div>
  );
}
