// /components/finance/CashFlow.tsx ver.1
'use client';

import { TrendingUp } from 'lucide-react';

export function CashFlow() {
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
}
