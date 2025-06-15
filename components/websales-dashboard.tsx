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
  const seriesNum = parseInt(seriesName);
  if (isNaN(seriesNum)) return 'bg-white';
  
  const colors = [
    'bg-blue-50', 'bg-green-50', 'bg-yellow-50', 'bg-purple-50', 'bg-pink-50', 'bg-indigo-50',
    'bg-gray-50', 'bg-red-50', 'bg-orange-50', 'bg-teal-50', 'bg-cyan-50', 'bg-lime-50',
    'bg-emerald-50', 'bg-violet-50', 'bg-fuchsia-50', 'bg-rose-50', 'bg-amber-50', 'bg-slate-50'
  ];
  return colors[(seriesNum - 1) % colors.length] || 'bg-white';
};

export default function WebSalesDashboard() {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    format(new Date(), "yyyy-MM")
  );
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadData = async (ym: string) => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("web_sales_full_month", {
          target_month: ym,
        });

        if (error) throw error;
        setRows((data as SummaryRow[]) ?? []);
      } catch (error) {
        console.error('データ読み込みエラー:', error);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    loadData(selectedMonth);
  }, [selectedMonth]);

  // 各サイト別の集計
  const siteStats = {
    amazon: {
      count: rows.reduce((sum, r) => sum + (r.amazon_count || 0), 0),
      revenue: rows.reduce((sum, r) => sum + ((r.amazon_count || 0) * (r.price || 0)), 0)
    },
    rakuten: {
      count: rows.reduce((sum, r) => sum + (r.rakuten_count || 0), 0),
      revenue: rows.reduce((sum, r) => sum + ((r.rakuten_count || 0) * (r.price || 0)), 0)
    },
    yahoo: {
      count: rows.reduce((sum, r) => sum + (r.yahoo_count || 0), 0),
      revenue: rows.reduce((sum, r) => sum + ((r.yahoo_count || 0) * (r.price || 0)), 0)
    },
    mercari: {
      count: rows.reduce((sum, r) => sum + (r.mercari_count || 0), 0),
      revenue: rows.reduce((sum, r) => sum + ((r.mercari_count || 0) * (r.price || 0)), 0)
    },
    base: {
      count: rows.reduce((sum, r) => sum + (r.base_count || 0), 0),
      revenue: rows.reduce((sum, r) => sum + ((r.base_count || 0) * (r.price || 0)), 0)
    },
    qoo10: {
      count: rows.reduce((sum, r) => sum + (r.qoo10_count || 0), 0),
      revenue: rows.reduce((sum, r) => sum + ((r.qoo10_count || 0) * (r.price || 0)), 0)
    }
  };

  const rankedProducts = rows
    .map(r => {
      const totalCount = (r.amazon_count || 0) + (r.rakuten_count || 0) + (r.yahoo_count || 0) + 
                         (r.mercari_count || 0) + (r.base_count || 0) + (r.qoo10_count || 0);
      const totalRevenue = totalCount * (r.price || 0);
      return { ...r, totalCount, totalRevenue };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-2">
        <label className="font-medium">対象月:</label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="border rounded px-3 py-2"
        />
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">データを読み込んでいます...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-blue-100 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-800">Amazon</h3>
              <p className="text-2xl font-bold text-blue-900">{siteStats.amazon.count} 件</p>
              <p className="text-blue-700">¥{siteStats.amazon.revenue.toLocaleString()}</p>
            </div>
            <div className="bg-red-100 p-4 rounded-lg">
              <h3 className="font-semibold text-red-800">楽天</h3>
              <p className="text-2xl font-bold text-red-900">{siteStats.rakuten.count} 件</p>
              <p className="text-red-700">¥{siteStats.rakuten.revenue.toLocaleString()}</p>
            </div>
            <div className="bg-purple-100 p-4 rounded-lg">
                <h3 className="font-semibold text-purple-800">Yahoo!</h3>
                <p className="text-2xl font-bold text-purple-900">{siteStats.yahoo.count} 件</p>
                <p className="text-purple-700">¥{siteStats.yahoo.revenue.toLocaleString()}</p>
            </div>
            <div className="bg-orange-100 p-4 rounded-lg">
                <h3 className="font-semibold text-orange-800">メルカリ</h3>
                <p className="text-2xl font-bold text-orange-900">{siteStats.mercari.count} 件</p>
                <p className="text-orange-700">¥{siteStats.mercari.revenue.toLocaleString()}</p>
            </div>
            <div className="bg-green-100 p-4 rounded-lg">
                <h3 className="font-semibold text-green-800">BASE</h3>
                <p className="text-2xl font-bold text-green-900">{siteStats.base.count} 件</p>
                <p className="text-green-700">¥{siteStats.base.revenue.toLocaleString()}</p>
            </div>
            <div className="bg-yellow-100 p-4 rounded-lg">
                <h3 className="font-semibold text-yellow-800">Qoo10</h3>
                <p className="text-2xl font-bold text-yellow-900">{siteStats.qoo10.count} 件</p>
                <p className="text-yellow-700">¥{siteStats.qoo10.revenue.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg border">
            <h2 className="text-lg font-semibold p-4 border-b">全商品一覧</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-1 py-1 text-left">商品名</th>
                    <th className="border px-1 py-1 text-center w-12">シリーズ</th>
                    <th className="border px-1 py-1 text-center w-12">商品番号</th>
                    <th className="border px-1 py-1 text-right w-16">単価</th>
                    <th className="border px-1 py-1 text-center w-16">Amazon</th>
                    <th className="border px-1 py-1 text-center w-16">楽天</th>
                    <th className="border px-1 py-1 text-center w-16">Yahoo!</th>
                    <th className="border px-1 py-1 text-center w-16">メルカリ</th>
                    <th className="border px-1 py-1 text-center w-16">BASE</th>
                    <th className="border px-1 py-1 text-center w-16">Qoo10</th>
                    <th className="border px-1 py-1 text-center w-16">合計数</th>
                    <th className="border px-1 py-1 text-right w-20">売上</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedProducts.map((r) => {
                    const totalCount = r.totalCount;
                    const totalRevenue = r.totalRevenue;
                    const rowColor = getSeriesColor(r.series_name);

                    return (
                      <tr key={r.id} className={`hover:brightness-95 ${rowColor}`}>
                        <td className="border px-1 py-0.5">{r.product_name}</td>
                        <td className="border px-1 py-0.5 text-center">{r.series_name}</td>
                        <td className="border px-1 py-0.5 text-center">{r.product_number}</td>
                        <td className="border px-1 py-0.5 text-right">{r.price?.toLocaleString()}</td>
                        <td className="border px-1 py-0.5 text-center">{r.amazon_count || 0}</td>
                        <td className="border px-1 py-0.5 text-center">{r.rakuten_count || 0}</td>
                        <td className="border px-1 py-0.5 text-center">{r.yahoo_count || 0}</td>
                        <td className="border px-1 py-0.5 text-center">{r.mercari_count || 0}</td>
                        <td className="border px-1 py-0.5 text-center">{r.base_count || 0}</td>
                        <td className="border px-1 py-0.5 text-center">{r.qoo10_count || 0}</td>
                        <td className="border px-1 py-0.5 text-center font-bold">{totalCount}</td>
                        <td className="border px-1 py-0.5 text-right font-bold">{totalRevenue.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
