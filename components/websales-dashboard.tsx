"use client";

import { useEffect, useState } from "react";

// 正しい型定義（実際のデータベース構造に合わせる）
type SummaryRow = {
  id: number;
  product_id: number | null;
  product_name: string;
  series_name: string | null;
  price: number | null;
  report_month: string | null;
  amazon_count: number | null;
  rakuten_count: number | null;
  yahoo_count: number | null;
  mercari_count: number | null;
  base_count: number | null;
  qoo10_count: number | null;
  floor_count: number | null;
  total_count: number | null;
  total_sales: number | null;
  created_at: string;
  updated_at: string;
};

// シリーズ名に応じた背景色を取得するヘルパー関数
const getSeriesColor = (seriesName: string | null) => {
  if (!seriesName) return 'bg-white';
  let hash = 0;
  for (let i = 0; i < seriesName.length; i++) {
    const char = seriesName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const colors = [
    'bg-blue-50', 'bg-green-50', 'bg-yellow-50', 'bg-purple-50', 'bg-pink-50', 'bg-indigo-50',
    'bg-gray-50', 'bg-red-50', 'bg-orange-50', 'bg-teal-50', 'bg-cyan-50', 'bg-lime-50',
    'bg-emerald-50', 'bg-violet-50', 'bg-fuchsia-50', 'bg-rose-50'
  ];
  const index = Math.abs(hash % colors.length);
  return colors[index];
};

// ダッシュボード本体のコンポーネント
const WebSalesDashboard = () => {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 月選択の機能
  const [month, setMonth] = useState<string>('2025-04');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/web-sales-data'); 
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (data && Array.isArray(data.data)) {
          // product_numberではなくidでソート
          const sortedData = data.data.sort((a: SummaryRow, b: SummaryRow) => a.id - b.id);
          setSummary(sortedData);
        } else {
          setSummary([]);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [month]);

  if (loading) return <div className="flex justify-center items-center h-64">Loading...</div>;
  if (error) return <div className="p-4 text-red-600 bg-red-100 rounded-md">Error: {error}</div>;
  
  return (
    <div className="w-full space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WEB販売管理</h1>
          <p className="text-gray-500">月次の販売実績を確認・管理します。</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border rounded-md text-base p-2 bg-white"
        />
      </header>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="p-6 border-b">
          <h3 className="text-xl font-semibold">{month}月 販売実績</h3>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">商品名</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600 whitespace-nowrap">シリーズ</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 whitespace-nowrap">単価</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Amazon</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">楽天</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Yahoo!</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">メルカリ</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">BASE</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Qoo10</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">フロア</th>
                  <th className="px-4 py-3 text-center font-bold text-gray-700 whitespace-nowrap">合計数量</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-700 whitespace-nowrap">合計金額</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => {
                  // データベースに既に計算済みの値がある場合はそれを使用、なければ計算
                  const totalCount = r.total_count || (
                    (r.amazon_count || 0) + (r.rakuten_count || 0) + (r.yahoo_count || 0) + 
                    (r.mercari_count || 0) + (r.base_count || 0) + (r.qoo10_count || 0) + (r.floor_count || 0)
                  );
                  
                  const totalRevenue = r.total_sales || (totalCount * (r.price || 0));
                  const rowColor = getSeriesColor(r.series_name);

                  return (
                    <tr key={r.id} className={`border-t ${rowColor} hover:bg-gray-100`}>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{r.product_name}</td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">{r.series_name || '-'}</td>
                      <td className="px-4 py-3 text-right">{r.price ? `¥${r.price.toLocaleString()}` : '-'}</td>
                      <td className="px-4 py-3 text-center">{r.amazon_count || '-'}</td>
                      <td className="px-4 py-3 text-center">{r.rakuten_count || '-'}</td>
                      <td className="px-4 py-3 text-center">{r.yahoo_count || '-'}</td>
                      <td className="px-4 py-3 text-center">{r.mercari_count || '-'}</td>
                      <td className="px-4 py-3 text-center">{r.base_count || '-'}</td>
                      <td className="px-4 py-3 text-center">{r.qoo10_count || '-'}</td>
                      <td className="px-4 py-3 text-center">{r.floor_count || '-'}</td>
                      <td className="px-4 py-3 text-center font-bold">{totalCount}</td>
                      <td className="px-4 py-3 text-right font-bold">¥{totalRevenue.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebSalesDashboard;
