// /components/finance/ProfitLoss.tsx ver.1
'use client';

import { AccountBalance } from '@/types/finance';

interface ProfitLossProps {
  revenues: AccountBalance[];
  expenses: AccountBalance[];
}

export function ProfitLoss({ revenues, expenses }: ProfitLossProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY'
    }).format(amount);
  };

  const calculateTotal = (items: AccountBalance[]) => {
    return items.reduce((sum, item) => sum + item.balance, 0);
  };

  const totalRevenues = calculateTotal(revenues);
  const totalExpenses = calculateTotal(expenses);
  const netIncome = totalRevenues - totalExpenses;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">損益計算書</h3>
      
      <div className="space-y-6">
        <div>
          <h4 className="font-medium mb-3 text-green-700">収益</h4>
          <div className="space-y-2 ml-4">
            {revenues.length === 0 ? (
              <div className="text-sm text-gray-500">データがありません</div>
            ) : (
              revenues.map(item => (
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
            {expenses.length === 0 ? (
              <div className="text-sm text-gray-500">データがありません</div>
            ) : (
              expenses.map(item => (
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
}
