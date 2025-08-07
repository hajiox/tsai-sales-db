// /app/finance/general-ledger/page.tsx ver.5 - インポートパス修正版
'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { FileSpreadsheet, Upload, Calendar, Trash2 } from 'lucide-react';
import GeneralLedgerImportModal from '@/components/general-ledger/GeneralLedgerImportModal';

interface MonthlySummary {
  report_month: string;
  total_debit: number;
  total_credit: number;
  transaction_count: number;
  account_count: number;
}

export default function GeneralLedgerPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlySummary[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Supabaseクライアントを作成
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 初期表示時に現在の年月を設定
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    setSelectedMonth(`${year}年${month}月`);
    loadMonthlySummaries();
  }, []);

  // 月次サマリーを取得
  const loadMonthlySummaries = async () => {
    const { data, error } = await supabase
      .from('monthly_account_balance')
      .select('report_month')
      .order('report_month', { ascending: false });

    if (error) {
      console.error('月次データ取得エラー:', error);
      return;
    }

    // 月ごとに集計
    const summaryMap = new Map<string, MonthlySummary>();
    
    if (data) {
      for (const item of data) {
        const month = item.report_month;
        if (!summaryMap.has(month)) {
          // 各月の詳細を取得
          const { data: ledgerData } = await supabase
            .from('general_ledger')
            .select('debit_amount, credit_amount')
            .eq('report_month', month);

          const { data: accountData } = await supabase
            .from('monthly_account_balance')
            .select('account_code')
            .eq('report_month', month);

          let totalDebit = 0;
          let totalCredit = 0;

          if (ledgerData) {
            ledgerData.forEach(row => {
              totalDebit += row.debit_amount || 0;
              totalCredit += row.credit_amount || 0;
            });
          }

          summaryMap.set(month, {
            report_month: month,
            total_debit: totalDebit,
            total_credit: totalCredit,
            transaction_count: ledgerData?.length || 0,
            account_count: accountData?.length || 0
          });
        }
      }
    }

    setMonthlySummaries(Array.from(summaryMap.values()));
  };

  // 日付フォーマット関数
  const formatMonthDisplay = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}年${month}月`;
  };

  // 月選択の変更処理
  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value; // YYYY-MM形式
    if (inputValue) {
      const [year, month] = inputValue.split('-');
      setSelectedMonth(`${year}年${parseInt(month)}月`);
    }
  };

  // 現在の選択値をinput用の形式に変換
  const getInputValue = () => {
    const match = selectedMonth.match(/(\d{4})年(\d{1,2})月/);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      return `${year}-${month}`;
    }
    return '';
  };

  // データ削除機能
  const handleDeleteMonth = async () => {
    if (!selectedMonth) {
      alert('削除する月を選択してください');
      return;
    }

    const match = selectedMonth.match(/(\d{4})年(\d{1,2})月/);
    if (!match) return;

    const year = match[1];
    const month = match[2].padStart(2, '0');
    const reportMonth = `${year}-${month}-01`;

    if (!confirm(`${selectedMonth}のデータを削除しますか？\nこの操作は取り消せません。`)) {
      return;
    }

    setIsDeleting(true);

    try {
      // 1. general_ledgerから削除
      const { error: ledgerError } = await supabase
        .from('general_ledger')
        .delete()
        .eq('report_month', reportMonth);

      if (ledgerError) throw ledgerError;

      // 2. monthly_account_balanceから削除
      const { error: balanceError } = await supabase
        .from('monthly_account_balance')
        .delete()
        .eq('report_month', reportMonth);

      if (balanceError) throw balanceError;

      alert(`${selectedMonth}のデータを削除しました`);
      
      // リロード
      await loadMonthlySummaries();
    } catch (error) {
      console.error('削除エラー:', error);
      alert('データの削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">総勘定元帳</h1>
        <p className="text-gray-600">会計データの管理と分析</p>
      </div>

      {/* コントロールパネル */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-gray-500" />
              <input
                type="month"
                value={getInputValue()}
                onChange={handleMonthChange}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                lang="ja"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>インポート</span>
            </button>
            
            <button
              onClick={handleDeleteMonth}
              disabled={isDeleting || !selectedMonth}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeleting ? '削除中...' : '月次データ削除'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 月次サマリー */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">月次データ一覧</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  対象月
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  借方合計
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  貸方合計
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  取引件数
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  勘定科目数
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {monthlySummaries.length > 0 ? (
                monthlySummaries.map((summary) => (
                  <tr key={summary.report_month} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatMonthDisplay(summary.report_month)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      ¥{summary.total_debit.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      ¥{summary.total_credit.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      {summary.transaction_count.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      {summary.account_count}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                    データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* インポートモーダル */}
      <GeneralLedgerImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => {
          setIsImportModalOpen(false);
          loadMonthlySummaries();
        }}
      />
    </div>
  );
}
