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

export default function WebSalesDashboard() {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    format(new Date(), "yyyy-MM")
  );
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

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

  useEffect(() => {
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

  // 全体の統計
  const totalStats = {
    count: Object.values(siteStats).reduce((sum, site) => sum + site.count, 0),
    revenue: Object.values(siteStats).reduce((sum, site) => sum + site.revenue, 0)
  };

  // ベスト20とワースト10の計算
  const rankedProducts = rows
    .map(r => {
      const totalCount = (r.amazon_count || 0) + (r.rakuten_count || 0) + (r.yahoo_count || 0) + 
                        (r.mercari_count || 0) + (r.base_count || 0) + (r.qoo10_count || 0);
      const totalRevenue = totalCount * (r.price || 0);
      return { ...r, totalCount, totalRevenue };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const best20 = rankedProducts.slice(0, 20);
  const worst10 = rankedProducts.filter(p => p.totalRevenue > 0).slice(-10).reverse();

  return (
    <div className="p-4 space-y-6">
      {/* 月選択 */}
      <div className="flex items-center gap-4">
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
          {/* 全体統計 */}
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-2">月間売上合計</h2>
            <div className="flex items-center gap-8">
              <div>
                <p className="text-3xl font-bold">{totalStats.count.toLocaleString()} 件</p>
                <p className="text-blue-100">総販売件数</p>
              </div>
              <div>
                <p className="text-3xl font-bold">¥{totalStats.revenue.toLocaleString()}</p>
                <p className="text-blue-100">総売上金額</p>
              </div>
            </div>
          </div>

          {/* サイト別統計 */}
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

          {/* ベスト20・ワースト10 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ベスト20 */}
            <div className="bg-white rounded-lg border shadow-sm">
              <div className="bg-green-50 p-4 border-b">
                <h2 className="text-lg font-semibold text-green-800">🏆 売上ベスト20</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border px-3 py-2 text-center w-16">順位</th>
                      <th className="border px-3 py-2 text-left">商品名</th>
                      <th className="border px-3 py-2 text-center w-16">件数</th>
                      <th className="border px-3 py-2 text-right w-24">売上金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {best20.map((product, index) => (
                      <tr key={product.id} className={`hover:bg-gray-50 ${index < 3 ? 'bg-yellow-50' : ''}`}>
                        <td className="border px-3 py-2 text-center font-semibold">
                          {index + 1}
                          {index === 0 && ' 🥇'}
                          {index === 1 && ' 🥈'}
                          {index === 2 && ' 🥉'}
                        </td>
                        <td className="border px-3 py-2">{product.product_name}</td>
                        <td className="border px-3 py-2 text-center">{product.totalCount}</td>
                        <td className="border px-3 py-2 text-right font-medium">¥{product.totalRevenue.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ワースト10 */}
            <div className="bg-white rounded-lg border shadow-sm">
              <div className="bg-red-50 p-4 border-b">
                <h2 className="text-lg font-semibold text-red-800">📉 売上ワースト10</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border px-3 py-2 text-center w-16">順位</th>
                      <th className="border px-3 py-2 text-left">商品名</th>
                      <th className="border px-3 py-2 text-center w-16">件数</th>
                      <th className="border px-3 py-2 text-right w-24">売上金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worst10.map((product, index) => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="border px-3 py-2 text-center">
                          {rankedProducts.length - worst10.length + index + 1}
                        </td>
                        <td className="border px-3 py-2">{product.product_name}</td>
                        <td className="border px-3 py-2 text-center">{product.totalCount}</td>
                        <td className="border px-3 py-2 text-right">¥{product.totalRevenue.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
