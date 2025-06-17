"use client";

import { useEffect, useState } from "react";

// Excelファイルに合わせた型定義
type ProductRow = {
  id: number;
  product_name: string;
  series_name: string | null;
  price: number | null;
  amazon_count: number | null;
  rakuten_count: number | null;
  yahoo_count: number | null;
  mercari_count: number | null;
  base_count: number | null;
  qoo10_count: number | null;
  floor_count: number | null;
  total_count: number | null;
  total_sales: number | null;
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
    'bg-gray-50', 'bg-red-50', 'bg-orange-50', 'bg-teal-50', 'bg-cyan-50', 'bg-lime-50'
  ];
  const index = Math.abs(hash % colors.length);
  return colors[index];
};

export default function WebSalesProductList({ month }: { month: string }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/web-sales-data');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && Array.isArray(data.data)) {
          // IDでソートして表示
          const sortedData = data.data.sort((a: ProductRow, b: ProductRow) => a.id - b.id);
          setProducts(sortedData);
        } else {
          setProducts([]);
        }
      } catch (e: any) {
        console.error('データ取得エラー:', e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [month]);

  // 合計を計算
  const totals = products.reduce((acc, product) => {
    acc.amazon += product.amazon_count || 0;
    acc.rakuten += product.rakuten_count || 0;
    acc.yahoo += product.yahoo_count || 0;
    acc.mercari += product.mercari_count || 0;
    acc.base += product.base_count || 0;
    acc.qoo10 += product.qoo10_count || 0;
    acc.floor += product.floor_count || 0;
    acc.totalCount += product.total_count || 0;
    acc.totalSales += product.total_sales || 0;
    return acc;
  }, {
    amazon: 0, rakuten: 0, yahoo: 0, mercari: 0, 
    base: 0, qoo10: 0, floor: 0, totalCount: 0, totalSales: 0
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-100 rounded-md">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* サマリー情報 */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">{month}月 販売実績サマリー</h3>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>Amazon: <span className="font-bold">{totals.amazon.toLocaleString()}</span>個</div>
          <div>楽天: <span className="font-bold">{totals.rakuten.toLocaleString()}</span>個</div>
          <div>Yahoo!: <span className="font-bold">{totals.yahoo.toLocaleString()}</span>個</div>
          <div>メルカリ: <span className="font-bold">{totals.mercari.toLocaleString()}</span>個</div>
          <div>BASE: <span className="font-bold">{totals.base.toLocaleString()}</span>個</div>
          <div>Qoo10: <span className="font-bold">{totals.qoo10.toLocaleString()}</span>個</div>
          <div>フロア: <span className="font-bold">{totals.floor.toLocaleString()}</span>個</div>
          <div className="font-bold text-lg">総売上: <span className="text-blue-600">¥{totals.totalSales.toLocaleString()}</span></div>
        </div>
      </div>

      {/* 商品一覧テーブル */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="p-4 border-b">
          <h3 className="text-xl font-semibold">{month}月 商品別販売実績 ({products.length}商品)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600 border">No.</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 border min-w-[300px]">商品名</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600 border">シリーズ</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 border">単価</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600 border">Amazon</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600 border">楽天</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600 border">Yahoo!</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600 border">メルカリ</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600 border">BASE</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600 border">Qoo10</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600 border">フロア</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 border">合計数量</th>
                <th className="px-3 py-2 text-right font-bold text-gray-700 border">合計金額</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, index) => {
                const rowColor = getSeriesColor(product.series_name);
                return (
                  <tr key={product.id} className={`border-b ${rowColor} hover:bg-gray-100`}>
                    <td className="px-3 py-2 text-center border">{index + 1}</td>
                    <td className="px-3 py-2 font-medium border">{product.product_name}</td>
                    <td className="px-3 py-2 text-center border">{product.series_name || '-'}</td>
                    <td className="px-3 py-2 text-right border">
                      {product.price ? `¥${product.price.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-center border">{product.amazon_count || '-'}</td>
                    <td className="px-3 py-2 text-center border">{product.rakuten_count || '-'}</td>
                    <td className="px-3 py-2 text-center border">{product.yahoo_count || '-'}</td>
                    <td className="px-3 py-2 text-center border">{product.mercari_count || '-'}</td>
                    <td className="px-3 py-2 text-center border">{product.base_count || '-'}</td>
                    <td className="px-3 py-2 text-center border">{product.qoo10_count || '-'}</td>
                    <td className="px-3 py-2 text-center border">{product.floor_count || '-'}</td>
                    <td className="px-3 py-2 text-center font-bold border">
                      {(product.total_count || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-bold border">
                      ¥{(product.total_sales || 0).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              
              {/* 合計行 */}
              <tr className="bg-gray-100 font-bold border-t-2">
                <td className="px-3 py-3 text-center border" colSpan={4}>合計</td>
                <td className="px-3 py-3 text-center border">{totals.amazon.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border">{totals.rakuten.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border">{totals.yahoo.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border">{totals.mercari.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border">{totals.base.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border">{totals.qoo10.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border">{totals.floor.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border text-blue-600">{totals.totalCount.toLocaleString()}</td>
                <td className="px-3 py-3 text-right border text-blue-600">¥{totals.totalSales.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
