"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";

type SummaryRow = {
  id: string;
  product_id: string;
  product_name: string;
  series_name: string | null;
  product_number: number;
  price: number | null;
  amazon_count: number | null;
  rakuten_count: number | null;
  yahoo_count: number | null;
  mercari_count: number | null;
  base_count: number | null;
  qoo10_count: number | null;
};

// シリーズ名に応じた背景色を取得
const getSeriesColor = (seriesName: string | null) => {
  if (!seriesName) return 'bg-white';
  let hash = 0;
  if (seriesName.length === 0) return 'bg-white';
  for (let i = 0; i < seriesName.length; i++) {
    const char = seriesName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const colors = [
    'bg-blue-50', 'bg-green-50', 'bg-yellow-50', 'bg-purple-50', 'bg-pink-50', 'bg-indigo-50',
    'bg-gray-50', 'bg-red-50', 'bg-orange-50', 'bg-teal-50', 'bg-cyan-50', 'bg-lime-50',
    'bg-emerald-50', 'bg-violet-50', 'bg-fuchsia-50', 'bg-rose-50'
  ];
  const index = Math.abs(hash % colors.length);
  return colors[index];
};

const WebSalesDashboard = () => {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          const sortedData = data.data.sort((a: SummaryRow, b: SummaryRow) => a.product_number - b.product_number);
          setSummary(sortedData);
        } else {
          console.error("Fetched data is not in the expected format:", data);
          setSummary([]);
        }
      } catch (e: any) {
        setError(e.message);
        console.error("Fetching data failed:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div className="flex justify-center items-center h-64">Loading...</div>;
  if (error) return <div className="p-4 text-red-600 bg-red-100 rounded-md">Error: {error}</div>;
  
  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">WEB販売管理</h1>
        <p className="text-gray-500">月次の販売実績を確認・管理します。</p>
      </header>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="p-6 border-b">
          <h3 className="text-xl font-semibold">2025年4月 販売実績</h3>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">商品名</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600 whitespace-nowrap">シリーズ</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600 whitespace-nowrap">商品番号</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 whitespace-nowrap">単価</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Amazon</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">楽天</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Yahoo!</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">メルカリ</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">BASE</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Qoo10</th>
                  <th className="px-4 py-3 text-center font-bold text-gray-700 whitespace-nowrap">合計数量</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-700 whitespace-nowrap">合計金額</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => {
                  const totalCount = 
                    (r.amazon_count || 0) + 
                    (r.rakuten_count || 0) + 
                    (r.yahoo_count || 0) + 
                    (r.mercari_count || 0) + 
                    (r.base_count || 0) + 
                    (r.qoo10_count || 0);
                  const totalRevenue = totalCount * (r.price || 0);
                  const rowColor = getSeriesColor(r.series_name);

                  return (
                    <tr key={r.id} className={`border-t ${rowColor} hover:bg-gray-100`}>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{r.product_name}</td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">{r.series_name}</td>
                      <td className="px-4 py-3 text-center">{r.product_number}</td>
                      <td className="px-4 py-3 text-right">{r.price?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">{r.amazon_count || '-'}</td>
                      <td className="px-4 py-3 text-center">{r.rakuten_count || '-'}</td>
                      <td className="px-4 py-3 text-center">{r.yahoo_count || '-'}</td>
                      <td className="px-4 py-3 text-center">{r.mercari_count || '-'}</td>
                      <td className="px-4 py-3 text-center">{r.base_count || '-'}</td>
                      <td className="px-4 py-3 text-center">{r.qoo10_count || '-'}</td>
                      <td className="px-4 py-3 text-center font-bold">{totalCount}</td>
                      <td className="px-4 py-3 text-right font-bold">{totalRevenue.toLocaleString()}</td>
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
