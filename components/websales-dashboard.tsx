"use client";

import { useEffect, useState } from "react";

// 最低限の型定義
type SummaryRow = {
  id: number;
  product_name: string;
  series_name: string | null;
  price: number | null;
  amazon_count: number | null;
  rakuten_count: number | null;
  yahoo_count: number | null;
  total_count: number | null;
  total_sales: number | null;
};

// ダッシュボード本体のコンポーネント
const WebSalesDashboard = () => {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [month] = useState<string>('2025-04');

  // 一旦useEffectを無効化してデプロイを成功させる
  /*
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/web-sales-data');
        const data = await response.json();
        setSummary(data?.data?.slice(0, 5) || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);
  */

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
          readOnly
          className="border rounded-md text-base p-2 bg-white"
        />
      </header>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="p-6 border-b">
          <h3 className="text-xl font-semibold">{month}月 販売実績</h3>
        </div>
        <div className="p-6">
          <div className="text-center py-8 text-gray-500">
            {loading ? 'Loading...' : 
             error ? `Error: ${error}` : 
             '開発中です。データ取得機能は次のステップで実装します。'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebSalesDashboard;
