// /components/finance/BalanceSheet.tsx ver.1
'use client';

import { AccountBalance } from '@/types/finance';

interface BalanceSheetProps {
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
}

export function BalanceSheet({ assets, liabilities, equity }: BalanceSheetProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY'
    }).format(amount);
  };

  const calculateTotal = (items: AccountBalance[]) => {
    return items.reduce((sum, item) => sum + item.balance, 0);
  };

  const totalAssets = calculateTotal(assets);
  const totalLiabilities = calculateTotal(liabilities);
  const totalEquity = calculateTotal(equity);
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-blue-700">資産の部</h3>
        <div className="space-y-2">
          {assets.map(item => (
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
              {liabilities.map(item => (
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
              {equity.map(item => (
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
}
