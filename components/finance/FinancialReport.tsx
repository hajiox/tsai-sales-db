// /components/finance/FinancialReport.tsx ver.1
'use client';

import { useState } from 'react';
import { Download, Printer, Eye } from 'lucide-react';
import { AccountBalance } from '@/types/finance';

interface FinancialReportProps {
  bsData: {
    assets: AccountBalance[];
    liabilities: AccountBalance[];
    equity: AccountBalance[];
  };
  plData: {
    revenues: AccountBalance[];
    expenses: AccountBalance[];
  };
  selectedMonth: string;
  includeClosing: boolean;
}

export function FinancialReport({ bsData, plData, selectedMonth, includeClosing }: FinancialReportProps) {
  const [showPreview, setShowPreview] = useState(false);
  
  // 日付フォーマット
  const [year, month] = selectedMonth.split('-');
  const reportDate = `${year}年${month}月`;
  const isClosingMonth = month === '07';
  const reportTitle = isClosingMonth && includeClosing ? `${year}年度 決算報告書` : `${reportDate} 月次報告書`;
  
  // 合計計算
  const totalAssets = bsData.assets.reduce((sum, item) => sum + item.balance, 0);
  const totalLiabilities = bsData.liabilities.reduce((sum, item) => sum + item.balance, 0);
  const totalEquity = bsData.equity.reduce((sum, item) => sum + item.balance, 0);
  const totalRevenues = plData.revenues.reduce((sum, item) => sum + item.balance, 0);
  const totalExpenses = plData.expenses.reduce((sum, item) => sum + item.balance, 0);
  const netIncome = totalRevenues - totalExpenses;
  
  // 主要指標の計算
  const equityRatio = totalAssets > 0 ? (totalEquity / totalAssets * 100).toFixed(1) : '0.0';
  const currentRatio = totalLiabilities > 0 ? (totalAssets / totalLiabilities * 100).toFixed(1) : '0.0';
  const profitMargin = totalRevenues > 0 ? (netIncome / totalRevenues * 100).toFixed(1) : '0.0';

  // PDF生成（実際にはサーバー側での実装が必要）
  const handleDownloadPDF = () => {
    alert('PDF生成機能は準備中です');
  };

  // 印刷
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* ツールバー */}
      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold text-gray-900">{reportTitle}</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Eye className="w-4 h-4" />
            <span>プレビュー</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            <Printer className="w-4 h-4" />
            <span>印刷</span>
          </button>
          <button
            onClick={handleDownloadPDF}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            <Download className="w-4 h-4" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* 決算サマリー */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold mb-4">決算サマリー</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-blue-50 p-4 rounded">
            <p className="text-sm text-gray-600 mb-1">総資産</p>
            <p className="text-2xl font-bold text-blue-600">
              ¥{totalAssets.toLocaleString()}
            </p>
          </div>
          <div className={`p-4 rounded ${netIncome >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-sm text-gray-600 mb-1">当期純利益</p>
            <p className={`text-2xl font-bold ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ¥{netIncome.toLocaleString()}
            </p>
          </div>
          <div className="bg-purple-50 p-4 rounded">
            <p className="text-sm text-gray-600 mb-1">自己資本比率</p>
            <p className="text-2xl font-bold text-purple-600">
              {equityRatio}%
            </p>
          </div>
        </div>
      </div>

      {/* 主要財務指標 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold mb-4">主要財務指標</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600">流動比率</p>
            <p className="text-lg font-semibold">{currentRatio}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">売上高利益率</p>
            <p className="text-lg font-semibold">{profitMargin}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">総負債</p>
            <p className="text-lg font-semibold">¥{totalLiabilities.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">純資産</p>
            <p className="text-lg font-semibold">¥{totalEquity.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* 貸借対照表サマリー */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold mb-4">貸借対照表</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 資産の部 */}
          <div>
            <h4 className="font-semibold text-gray-700 mb-3">資産の部</h4>
            <div className="space-y-2">
              {bsData.assets.slice(0, 5).map((item) => (
                <div key={item.account_code} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.account_name}</span>
                  <span className="font-medium">¥{item.balance.toLocaleString()}</span>
                </div>
              ))}
              {bsData.assets.length > 5 && (
                <div className="text-sm text-gray-500">他 {bsData.assets.length - 5} 項目</div>
              )}
              <div className="pt-2 border-t flex justify-between font-semibold">
                <span>資産合計</span>
                <span>¥{totalAssets.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* 負債・純資産の部 */}
          <div>
            <h4 className="font-semibold text-gray-700 mb-3">負債・純資産の部</h4>
            <div className="space-y-2">
              {bsData.liabilities.slice(0, 3).map((item) => (
                <div key={item.account_code} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.account_name}</span>
                  <span className="font-medium">¥{item.balance.toLocaleString()}</span>
                </div>
              ))}
              <div className="pt-2 border-t flex justify-between text-sm font-medium">
                <span>負債合計</span>
                <span>¥{totalLiabilities.toLocaleString()}</span>
              </div>
              {bsData.equity.slice(0, 2).map((item) => (
                <div key={item.account_code} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.account_name}</span>
                  <span className="font-medium">¥{item.balance.toLocaleString()}</span>
                </div>
              ))}
              <div className="pt-2 border-t flex justify-between font-semibold">
                <span>負債・純資産合計</span>
                <span>¥{(totalLiabilities + totalEquity).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 損益計算書サマリー */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold mb-4">損益計算書</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-700">売上高</span>
            <span className="font-semibold text-lg">¥{totalRevenues.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-700">売上原価・販管費</span>
            <span className="font-semibold text-lg">¥{totalExpenses.toLocaleString()}</span>
          </div>
          <div className="pt-3 border-t flex justify-between items-center">
            <span className="font-bold text-lg">当期純利益</span>
            <span className={`font-bold text-xl ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ¥{netIncome.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 主要費用項目 */}
        <div className="mt-4 pt-4 border-t">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">主要費用項目</h4>
          <div className="space-y-1">
            {plData.expenses.slice(0, 5).map((item) => (
              <div key={item.account_code} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.account_name}</span>
                <span>¥{item.balance.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 注記事項 */}
      {isClosingMonth && includeClosing && (
        <div className="bg-yellow-50 rounded-lg p-6">
          <h3 className="text-lg font-bold mb-2 text-yellow-800">注記事項</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• 本決算書は決算調整後の数値を表示しています</li>
            <li>• 決算調整には減価償却、引当金、税効果等の調整が含まれています</li>
            <li>• 最終的な決算数値は監査法人による監査後に確定します</li>
          </ul>
        </div>
      )}

      {/* プレビューモーダル */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="print-content">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold mb-2">株式会社 テクニカルスタッフ</h1>
                <h2 className="text-xl">{reportTitle}</h2>
                <p className="text-gray-600">作成日: {new Date().toLocaleDateString('ja-JP')}</p>
              </div>
              
              {/* ここに詳細な決算書内容を表示 */}
              <div className="space-y-6">
                {/* 貸借対照表詳細 */}
                <div>
                  <h3 className="text-lg font-bold border-b pb-2 mb-3">貸借対照表</h3>
                  {/* 詳細内容 */}
                </div>
                
                {/* 損益計算書詳細 */}
                <div>
                  <h3 className="text-lg font-bold border-b pb-2 mb-3">損益計算書</h3>
                  {/* 詳細内容 */}
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowPreview(false)}
                className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
