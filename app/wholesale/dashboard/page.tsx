// /app/wholesale/dashboard/page.tsx ver.5 (入力対応版)
"use client"

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Package, Users, TrendingUp, FileText, DollarSign } from 'lucide-react';

interface SalesData {
  [productId: string]: {
    [date: string]: number;
  };
}

export default function WholesaleDashboard() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [products, setProducts] = useState<any[]>([]);
  const [salesData, setSalesData] = useState<SalesData>({});
  const [loading, setLoading] = useState(true);

  // データ取得
  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    fetchSalesData();
  }, [selectedMonth]);

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/wholesale/products');
      const data = await response.json();
      if (data.success) {
        setProducts(data.products);
      }
    } catch (error) {
      console.error('商品取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSalesData = async () => {
    try {
      const response = await fetch(`/api/wholesale/sales?month=${selectedMonth}`);
      const data = await response.json();
      if (data.success) {
        // 売上データを整形
        const formatted: SalesData = {};
        data.sales.forEach((sale: any) => {
          if (!formatted[sale.product_id]) {
            formatted[sale.product_id] = {};
          }
          const day = new Date(sale.sale_date).getDate();
          formatted[sale.product_id][day] = sale.quantity;
        });
        setSalesData(formatted);
      }
    } catch (error) {
      console.error('売上データ取得エラー:', error);
    }
  };

  const handleQuantityChange = async (productId: string, day: number, value: string) => {
    const quantity = parseInt(value) || 0;
    const product = products.find(p => p.id === productId);
    if (!product) return;

    // UIを即座に更新
    setSalesData(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [day]: quantity || undefined
      }
    }));

    // APIで保存
    const saleDate = `${selectedMonth}-${String(day).padStart(2, '0')}`;
    try {
      await fetch('/api/wholesale/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          saleDate,
          quantity,
          unitPrice: product.price
        })
      });
    } catch (error) {
      console.error('保存エラー:', error);
    }
  };

  // 月選択肢の生成
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月`
    };
  });

  // 月の日数を取得
  const getDaysInMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };

  const daysInMonth = getDaysInMonth();

  // 合計計算
  const calculateTotals = (productId: string) => {
    const sales = salesData[productId] || {};
    const totalQuantity = Object.values(sales).reduce((sum: number, qty: any) => sum + (qty || 0), 0);
    const product = products.find(p => p.id === productId);
    const totalAmount = totalQuantity * (product?.price || 0);
    return { totalQuantity, totalAmount };
  };

  const grandTotal = products.reduce((sum, product) => {
    const { totalAmount } = calculateTotals(product.id);
    return sum + totalAmount;
  }, 0);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">卸販売管理システム</h1>
            </div>
            <div className="flex items-center gap-3">
              <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-8 px-2 py-1 text-sm rounded-md border border-input bg-background"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-[1600px] mx-auto space-y-4">
          {/* サマリーカード */}
          <div className="grid grid-cols-4 gap-3">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium text-blue-900 flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  卸商品
                </CardTitle>
              </CardHeader>
              <CardContent className="py-1 px-3">
                <div className="text-lg font-bold text-blue-900">{products.length} 件</div>
                <div className="text-xs text-blue-700">¥{grandTotal.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium text-green-90
