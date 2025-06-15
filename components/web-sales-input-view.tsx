'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Download, Upload } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type SupabaseRpcResult = {
  id: string;
  product_id: string;
  product_name: string;
  series_name: string;
  product_number: number;
  price: number;
  amazon_count: number;
  rakuten_count: number;
  yahoo_count: number;
  mercari_count: number;
  base_count: number;
  qoo10_count: number;
};

type Row = {
  id: string | null;
  product_id: string;
  product_name: string;
  series_name: string;
  product_number: number;
  price: number;
  amazon_count: number;
  rakuten_count: number;
  yahoo_count: number;
  mercari_count: number;
  base_count: number;
  qoo10_count: number;
};

export default function WebSalesInputView() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('2025-04');

  const load = async (month: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .rpc('web_sales_full_month', { target_month: month })
        .returns<SupabaseRpcResult[]>();
      
      if (error) throw error;
      
      const transformedData: Row[] = (data || []).map(item => ({
        id: item.id || null,
        product_id: String(item.product_id || ''),
        product_name: String(item.product_name || ''),
        series_name: String(item.series_name || ''),
        product_number: Number(item.product_number || 0),
        price: Number(item.price || 0),
        amazon_count: Number(item.amazon_count || 0),
        rakuten_count: Number(item.rakuten_count || 0),
        yahoo_count: Number(item.yahoo_count || 0),
        mercari_count: Number(item.mercari_count || 0),
        base_count: Number(item.base_count || 0),
        qoo10_count: Number(item.qoo10_count || 0),
      }));
      
      setRows(transformedData);
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(selectedMonth);
  }, [selectedMonth]);

  const calculateTotals = () => {
    const totalProducts = rows.length;
    const totalSales = rows.reduce((sum, row) => 
      sum + row.amazon_count + row.rakuten_count + row.yahoo_count + 
      row.mercari_count + row.base_count + row.qoo10_count, 0);
    const totalRevenue = rows.reduce((sum, row) => 
      sum + (row.amazon_count + row.rakuten_count + row.yahoo_count + 
      row.mercari_count + row.base_count + row.qoo10_count) * row.price, 0);
    
    return { totalProducts, totalSales, totalRevenue };
  };

  const { totalProducts, totalSales, totalRevenue } = calculateTotals();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Web販売管理システム</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="month">対象月</Label>
            <Input
              id="month"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={() => load(selectedMonth)} disabled={loading}>
            {loading ? '読込中...' : '再読み込み'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>商品数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}件</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>総販売数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSales.toLocaleString()}個</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>総売上</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>販売データ一覧</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-2 py-1 text-left text-sm">商品名</th>
                  <th className="border border-gray-300 px-2 py-1 text-center text-sm">シリーズ</th>
                  <th className="border border-gray-300 px-2 py-1 text-center text-sm">商品番号</th>
                  <th className="border border-gray-300 px-2 py-1 text-right text-sm">単価</th>
                  <th className="border border-gray-300 px-2 py-1 text-center text-sm">Amazon</th>
                  <th className="border border-gray-300 px-2 py-1 text-center text-sm">楽天</th>
                  <th className="border border-gray-300 px-2 py-1 text-center text-sm">Yahoo!</th>
                  <th className="border border-gray-300 px-2 py-1 text-center text-sm">メルカリ</th>
                  <th className="border border-gray-300 px-2 py-1 text-center text-sm">BASE</th>
                  <th className="border border-gray-300 px-2 py-1 text-center text-sm">Qoo10</th>
                  <th className="border border-gray-300 px-2 py-1 text-center text-sm">合計数</th>
                  <th className="border border-gray-300 px-2 py-1 text-right text-sm">売上</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const totalCount = row.amazon_count + row.rakuten_count + row.yahoo_count + 
                    row.mercari_count + row.base_count + row.qoo10_count;
                  const revenue = totalCount * row.price;
                  
                  return (
                    <tr key={row.product_id || index} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-2 py-1 text-sm">{row.product_name}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center text-sm">{row.series_name}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center text-sm">{row.product_number}</td>
                      <td className="border border-gray-300 px-2 py-1 text-right text-sm">¥{row.price.toLocaleString()}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center text-sm">{row.amazon_count}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center text-sm">{row.rakuten_count}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center text-sm">{row.yahoo_count}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center text-sm">{row.mercari_count}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center text-sm">{row.base_count}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center text-sm">{row.qoo10_count}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center text-sm font-semibold">{totalCount}</td>
                      <td className="border border-gray-300 px-2 py-1 text-right text-sm font-semibold">¥{revenue.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
