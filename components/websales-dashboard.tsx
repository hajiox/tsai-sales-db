"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  // シリーズ名からハッシュ値を生成して色を決定する（安定した色を割り当てるため）
  let hash = 0;
  for (let i = 0; i < seriesName.length; i++) {
    hash = seriesName.charCodeAt(i) + ((hash << 5) - hash);
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
      // APIルート経由でデータを取得
      try {
        const response = await fetch('/api/web-sales-data');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // `data.data` の存在を確認
        if (data && Array.isArray(data.data)) {
          // product_number を基準にソート
          const sortedData = data.data.sort((a: SummaryRow, b: SummaryRow) => a.product_number - b.product_number);
          setSummary(sortedData);
        } else {
          // データが期待する形式でなかった場合
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
  
  // 以降で表示するJSX全体を、幅いっぱいに広がるdivで囲みます
  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">WEB販売管理</h1>
        <p className="text-muted-foreground">月次の販売実績を確認・管理します。</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>2025年4月 販売実績</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="whitespace-nowrap">商品名</TableHead>
                  <TableHead className="text-center whitespace-nowrap">シリーズ</TableHead>
                  <TableHead className="text-center whitespace-nowrap">商品番号</TableHead>
                  <TableHead className="text-right whitespace-nowrap">単価</TableHead>
                  <TableHead className="text-center">Amazon</TableHead>
                  <TableHead className="text-center">楽天</TableHead>
                  <TableHead className="text-center">Yahoo!</TableHead>
                  <TableHead className="text-center">メルカリ</TableHead>
                  <TableHead className="text-center">BASE</TableHead>
                  <TableHead className="text-center">Qoo10</TableHead>
                  <TableHead className="text-center font-bold whitespace-nowrap">合計数量</TableHead>
                  <TableHead className="text-right font-bold whitespace-nowrap">合計金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
                    <TableRow key={r.id} className={`${rowColor}`}>
                      <TableCell className="font-medium whitespace-nowrap">{r.product_name}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">{r.series_name}</TableCell>
                      <TableCell className="text-center">{r.product_number}</TableCell>
                      <TableCell className="text-right">{r.price?.toLocaleString()}</TableCell>
                      <TableCell className="text-center">{r.amazon_count || '-'}</TableCell>
                      <TableCell className="text-center">{r.rakuten_count || '-'}</TableCell>
                      <TableCell className="text-center">{r.yahoo_count || '-'}</TableCell>
                      <TableCell className="text-center">{r.mercari_count || '-'}</TableCell>
                      <TableCell className="text-center">{r.base_count || '-'}</TableCell>
                      <TableCell className="text-center">{r.qoo10_count || '-'}</TableCell>
                      <TableCell className="text-center font-bold">{totalCount}</TableCell>
                      <TableCell className="text-right font-bold">{totalRevenue.toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WebSalesDashboard;
