// /app/finance/financial-statements/page.tsx ver.1
'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { FileText, TrendingUp, DollarSign, Calendar, Download } from 'lucide-react';

interface AccountBalance {
  account_code: string;
  account_name: string;
  account_type: string;
  balance: number;
}

interface FinancialData {
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  revenue: AccountBalance[];
  expenses: AccountBalance[];
}

export default function FinancialStatementsPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'bs' | 'pl' | 'cf'>('bs');
  const [financialData, setFinancialData] = useState<FinancialData>({
    assets: [],
    liabilities: [],
    equity: [],
    revenue: [],
    expenses: []
  });
  const [loading, setLoading] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    setSelectedMonth(`${year}-${month}`);
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      loadFinancialData();
    }
  }, [selectedMonth]);

  const loadFinancialData = async () => {
    setLoading(true);
    try {
      const reportMonth = `${selectedMonth}-01`;
      
      // 月次残高データを取得
      const { data: balances, error } = await supabase
        .from('monthly_account_balance')
        .select(`
          account_code,
          closing_balance,
          account_master (
            account_name,
            account_type
          )
        `)
        .eq('report_month', reportMonth);

      if (error) throw error;

      // 勘定科目コードで分類
      const categorizedData: FinancialData = {
        assets: [],
        liabilities: [],
        equity: [],
        revenue: [],
        expenses: []
      };

      balances?.forEach((item: any) => {
        const code = parseInt(item.account_code);
        const balance: AccountBalance = {
          account_code: item.account_code,
          account_name: item.account_master?.account_name || `科目${item.account_code}`,
          account_type: item.account_master?.account_type || '未分類',
          balance: item.closing_balance || 0
        };

        // 勘定科目コードで分類
        if (code >= 100 && code < 200) {
          // 資産
          categorizedData.assets.push(balance);
        } else if (code >= 200 && code < 300) {
          // 負債
          categorizedData.liabilities.push(balance);
        } else if (code >= 300 && code < 400) {
          // 純資産
          categorizedData.equity.push(balance);
        } else if (code >= 800 && code < 900) {
          // 収益
          categorizedData.revenue.push(balance);
        } else if ((code >= 400 && code < 700) || code >= 500) {
          // 費用
          categorizedData.expenses.push(balance);
        }
      });

      // 特殊な勘定科目の分類調整
      balances?.forEach((item: any) => {
        const code = parseInt(item.account_code);
        // 1000番台の資産
        if (code >= 1000 && code < 1200) {
          const balance: AccountBalance = {
            account_code: item.account_code,
            account_name: item.account_master?.account_name || `科目${item.account_code}`,
            account_type: item.account_master?.account_type || '未分類',
            balance: item.closing_balance || 0
          };
          categorizedData.assets.push(balance);
        }
        // 1200番台の負債
        else if (code >= 1200 && code < 1300) {
          const balance: AccountBalance = {
            account_code: item.account_code,
            account_name: item.account_master?.account_name || `科目${item.account_code}`,
            account_type: item.account_master?.account_type || '未分類',
            balance: item.closing_balance || 0
          };
          categorizedData.liabilities.push(balance);
        }
        // 3000番台の特殊勘定
        else if (code >= 3000 && code < 4000) {
          const balance: AccountBalance = {
            account_code: item.account_code,
            account_name: item.account_master?.account_name || `科目${item.account_code}`,
            account_type: item.account_master?.account_type || '未分類',
            balance: item.closing_balance || 0
          };
          if (item.account_name?.includes('リース')) {
            if (item.account_name.includes('資産')) {
              categorizedData.assets.push(balance);
            } else if (item.account_name.includes('債務')) {
              categorizedData.liabilities.push(balance);
            }
          }
        }
      });

      setFinancialData(categorizedData);
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  // 貸借対照表コンポーネント
  const BalanceSheet = () => {
    const totalAssets = financialData.assets.reduce((sum, item) => sum + item.balance, 0);
    const totalLiabilities = financialData.liabilities.reduce((sum, item) => sum + item.balance, 0);
    const totalEquity = financialData.equity.reduce((sum, item) => sum + item.balance, 0);

    return (
      <div className="grid grid-cols-2 gap-6">
        {/* 資産の部 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">資産の部</h3>
          <div className="space-y-2">
            {financialData.assets.map((item) => (
              <div key={item.account_code} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.account_name}</span>
                <span className="font-medium">¥{item.balance.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex justify-between font-semibold">
              <span>資産合計</span>
              <span>¥{totalAssets.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* 負債・純資産の部 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">負債・純資産の部</h3>
          
          {/* 負債 */}
          <div className="mb-6">
            <h4 className="text-md font-medium text-gray-700 mb-2">負債</h4>
            <div className="space-y-2">
              {financialData.liabilities.map((item) => (
                <div key={item.account_code} className="flex justify-between text-sm">
                  <span className="text-gray-600 ml-4">{item.account_name}</span>
                  <span className="font-medium">¥{item.balance.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="flex justify-between text-sm font-medium">
                <span className="ml-2">負債合計</span>
                <span>¥{totalLiabilities.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* 純資産 */}
          <div>
            <h4 className="text-md font-medium text-gray-700 mb-2">純資産</h4>
            <div className="space-y-2">
              {financialData.equity.map((item) => (
                <div key={item.account_code} className="flex justify-between text-sm">
                  <span className="text-gray-600 ml-4">{item.account_name}</span>
                  <span className="font-medium">¥{item.balance.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="flex justify-between text-sm font-medium">
                <span className="ml-2">純資産合計</span>
                <span>¥{totalEquity.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex justify-between font-semibold">
              <span>負債・純資産合計</span>
              <span>¥{(totalLiabilities + totalEquity).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 損益計算書コンポーネント
  const ProfitLossStatement = () => {
    const totalRevenue = financialData.revenue.reduce((sum, item) => sum + Math.abs(item.balance), 0);
    const totalExpenses = financialData.expenses.reduce((sum, item) => sum + Math.abs(item.balance), 0);
    const netIncome = totalRevenue - totalExpenses;

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">損益計算書</h3>
        
        {/* 収益 */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-700 mb-2">収益</h4>
          <div className="space-y-2">
            {financialData.revenue.map((item) => (
              <div key={item.account_code} className="flex justify-between text-sm">
                <span className="text-gray-600 ml-4">{item.account_name}</span>
                <span className="font-medium">¥{Math.abs(item.balance).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="flex justify-between font-medium">
              <span>収益合計</span>
              <span>¥{totalRevenue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* 費用 */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-700 mb-2">費用</h4>
          <div className="space-y-2">
            {financialData.expenses.map((item) => (
              <div key={item.account_code} className="flex justify-between text-sm">
                <span className="text-gray-600 ml-4">{item.account_name}</span>
                <span className="font-medium">¥{Math.abs(item.balance).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="flex justify-between font-medium">
              <span>費用合計</span>
              <span>¥{totalExpenses.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* 当期純利益 */}
        <div className="pt-4 border-t-2 border-gray-300">
          <div className="flex justify-between text-lg font-bold">
            <span>当期純利益</span>
            <span className={netIncome >= 0 ? 'text-green-600' : 'text-red-600'}>
              ¥{netIncome.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // キャッシュフロー計算書コンポーネント（簡易版）
  const CashFlowStatement = () => {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">キャッシュフロー計算書（簡易版）</h3>
        <div className="text-gray-500 text-center py-8">
          <p>キャッシュフロー計算書の作成には、</p>
          <p>前期比較データと追加の取引情報が必要です。</p>
          <p className="mt-4 text-sm">過去データの入力完了後に利用可能になります。</p>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">財務諸表</h1>
        <p className="text-gray-600">貸借対照表、損益計算書、キャッシュフロー計算書の確認</p>
      </div>

      {/* コントロールパネル */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-gray-500" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <button
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>エクスポート</span>
          </button>
        </div>
      </div>

      {/* タブ */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('bs')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'bs'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4" />
              <span>貸借対照表</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('pl')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pl'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4" />
              <span>損益計算書</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('cf')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'cf'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <DollarSign className="w-4 h-4" />
              <span>キャッシュフロー計算書</span>
            </div>
          </button>
        </nav>
      </div>

      {/* コンテンツ */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">データを読み込み中...</p>
        </div>
      ) : (
        <div>
          {activeTab === 'bs' && <BalanceSheet />}
          {activeTab === 'pl' && <ProfitLossStatement />}
          {activeTab === 'cf' && <CashFlowStatement />}
        </div>
      )}
    </div>
  );
}
