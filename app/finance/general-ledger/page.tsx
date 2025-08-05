// /app/finance/general-ledger/page.tsx ver.2
'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import GeneralLedgerImportModal from '@/components/general-ledger/GeneralLedgerImportModal';
import { Upload, TrendingUp, FileText, DollarSign } from 'lucide-react';

interface AccountBalance {
  account_code: string;
  account_name: string;
  account_type: string;
  closing_balance: number;
  total_debit: number;
  total_credit: number;
}

interface MonthlySummary {
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  total_revenue: number;
  total_expenses: number;
  net_income: number;
}

export default function GeneralLedgerPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClientComponentClient();

  // 初期値設定
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    setSelectedMonth(`${year}-${month}`);
  }, []);

  // データ取得
  const fetchData = async () => {
    if (!selectedMonth) return;
    
    setIsLoading(true);
    try {
      // 月次残高データを取得
      const { data: balances, error: balanceError } = await supabase
        .from('monthly_account_balance')
        .select(`
          account_code,
          closing_balance,
          total_debit,
          total_credit,
          account_master!inner(
            account_name,
            account_type
          )
        `)
        .eq('report_month', `${selectedMonth}-01`)
        .order('account_code');

      if (balanceError) throw balanceError;

      // データを整形
      const formattedBalances = balances?.map(item => ({
        account_code: item.account_code,
        account_name: item.account_master.account_name,
        account_type: item.account_master.account_type,
        closing_balance: item.closing_balance,
        total_debit: item.total_debit,
        total_credit: item.total_credit
      })) || [];

      setAccountBalances(formattedBalances);

      // サマリー計算
      const summary: MonthlySummary = {
        total_assets: 0,
        total_liabilities: 0,
        total_equity: 0,
        total_revenue: 0,
        total_expenses: 0,
        net_income: 0
      };

      formattedBalances.forEach(account => {
        // 簡易的な勘定科目分類（実際の運用では account_type を活用）
        if (account.account_name.includes('現金') || account.account_name.includes('預金') || 
            account.account_name.includes('売掛') || account.account_name.includes('商品')) {
          summary.total_assets += account.closing_balance;
        } else if (account.account_name.includes('買掛') || account.account_name.includes('借入')) {
          summary.total_liabilities += Math.abs(account.closing_balance);
        } else if (account.account_name.includes('資本')) {
          summary.total_equity += Math.abs(account.closing_balance);
        } else if (account.account_name.includes('売上')) {
          summary.total_revenue += Math.abs(account.total_credit - account.total_debit);
        } else if (account.account_name.includes('仕入') || account.account_name.includes('経費') || 
                   account.account_name.includes('給料')) {
          summary.total_expenses += account.total_debit - account.total_credit;
        }
      });

      summary.net_income = summary.total_revenue - summary.total_expenses;
      setMonthlySummary(summary);

    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedMonth) {
      fetchData();
    }
  }, [selectedMonth]);

  const handleImportComplete = () => {
    fetchData();
  };

  // 金額フォーマット
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY'
    }).format(amount);
  };

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">総勘定元帳</h1>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div>
              <label htmlFor="month" className="block text-sm font-medium text-gray-700">
                対象月
              </label>
              <input
                type="month"
                id="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="mt-1 block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
          </div>
          
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Upload className="h-4 w-4 mr-2" />
            インポート
          </button>
        </div>
      </div>

      {/* サマリーカード */}
      {monthlySummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">資産合計</p>
                <p className="text-lg font-semibold">{formatCurrency(monthlySummary.total_assets)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">負債合計</p>
                <p className="text-lg font-semibold">{formatCurrency(monthlySummary.total_liabilities)}</p>
              </div>
              <FileText className="h-8 w-8 text-red-500" />
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">純資産合計</p>
                <p className="text-lg font-semibold">{formatCurrency(monthlySummary.total_equity)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">収益合計</p>
                <p className="text-lg font-semibold">{formatCurrency(monthlySummary.total_revenue)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">費用合計</p>
                <p className="text-lg font-semibold">{formatCurrency(monthlySummary.total_expenses)}</p>
              </div>
              <FileText className="h-8 w-8 text-orange-500" />
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">当期純利益</p>
                <p className={`text-lg font-semibold ${monthlySummary.net_income >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(monthlySummary.net_income)}
                </p>
              </div>
              <DollarSign className={`h-8 w-8 ${monthlySummary.net_income >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
          </div>
        </div>
      )}

      {/* 勘定科目一覧 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            勘定科目別残高
          </h3>
          
          {isLoading ? (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : accountBalances.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              データがありません。Excelファイルをインポートしてください。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      勘定科目コード
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      勘定科目名
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      借方合計
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      貸方合計
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      残高
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {accountBalances.map((account) => (
                    <tr key={account.account_code} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {account.account_code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {account.account_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatCurrency(account.total_debit)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatCurrency(account.total_credit)}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
                        account.closing_balance >= 0 ? 'text-gray-900' : 'text-red-600'
                      }`}>
                        {formatCurrency(account.closing_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* インポートモーダル */}
      <GeneralLedgerImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}
