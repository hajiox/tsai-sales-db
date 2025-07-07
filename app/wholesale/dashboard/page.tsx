// /app/wholesale/dashboard/page.tsx ver.9 (列幅調整版)
"use client"

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Users, TrendingUp, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SummaryCards from '@/components/wholesale/summary-cards';
import RankingCards from '@/components/wholesale/ranking-cards';

interface SalesData {
  [productId: string]: {
    [date: string]: number;
  };
}

export default function WholesaleDashboard() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [products, setProducts] = useState<any[]>([]);
  const [salesData, setSalesData] = useState<SalesData>({});
  const [previousMonthData, setPreviousMonthData] = useState<SalesData>({});
  const [loading, setLoading] = useState(true);

  // データ取得
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await fetchProducts();
      setLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (products.length > 0) {
        fetchSalesData();
        fetchPreviousMonthData();
    }
  }, [selectedMonth, products]);

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/wholesale/products');
      const data = await response.json();
      if (data.success) {
        setProducts(data.products);
      } else {
        console.error('商品取得APIエラー:', data.error);
        setProducts([]);
      }
    } catch (error) {
      console.error('商品取得Fetchエラー:', error);
      setProducts([]);
    }
  };

  const fetchSalesData = async () => {
    try {
      const response = await fetch(`/api/wholesale/sales?month=${selectedMonth}`);
      const data = await response.json();
      if (data.success) {
        const formatted: SalesData = {};
        data.sales.forEach((sale: any) => {
          if (!formatted[sale.product_id]) {
            formatted[sale.product_id] = {};
          }
          const day = new Date(sale.sale_date).getUTCDate();
          formatted[sale.product_id][day] = sale.quantity;
        });
        setSalesData(formatted);
      }
    } catch (error) {
      console.error('売上データ取得エラー:', error);
    }
  };

  const fetchPreviousMonthData = async () => {
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const prevDate = new Date(year, month - 2);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      
      const response = await fetch(`/api/wholesale/sales?month=${prevMonth}`);
      const data = await response.json();
      if (data.success) {
        const formatted: SalesData = {};
        data.sales.forEach((sale: any) => {
          if (!formatted[sale.product_id]) {
            formatted[sale.product_id] = {};
          }
          const day = new Date(sale.sale_date).getUTCDate();
          formatted[sale.product_id][day] = sale.quantity;
        });
        setPreviousMonthData(formatted);
      }
    } catch (error) {
      console.error('前月データ取得エラー:', error);
    }
  };

  const handleQuantityChange = async (productId: string, day: number, value: string) => {
    // 省略（変更なし）
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月`
    };
  });

  const getDaysInMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };

  const daysInMonth = getDaysInMonth();

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
          <SummaryCards products={products} grandTotal={grandTotal} />

          {/* ランキングカード */}
          <RankingCards 
            products={products}
            salesData={salesData}
            previousMonthData={previousMonthData}
          />

          {/* 日別実績テーブル */}
          <Card className="flex-1">
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                日別売上実績
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2 font-medium text-gray-700 sticky left-0 bg-gray-50 z-10 min-w-[200px] border-r">商品情報</th>
                      {Array.from({ length: daysInMonth }, (_, i) => (
                        <th key={i + 1} className="text-center p-1 font-medium text-gray-700 min-w-[40px]">
                          {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr className="text-center">
                        <td colSpan={daysInMonth + 2} className="py-6 text-gray-500">
                          読み込み中...
                        </td>
                      </tr>
                    ) : products.length === 0 ? (
                      <tr className="text-center">
                        <td colSpan={daysInMonth + 2} className="py-6 text-gray-500">
                          商品データがありません。
                        </td>
                      </tr>
                    ) : (
                      products.map((product) => {
                        const { totalQuantity, totalAmount } = calculateTotals(product.id);
                        return (
                          <tr key={product.id} className="border-b hover:bg-gray-50">
                            <td className="text-left p-2 sticky left-0 bg-white hover:bg-gray-50 border-r z-10">
                              <div>
                                <div className="font-medium text-gray-900 truncate" title={product.product_name}>{product.product_name}</div>
                                <div className="text-xs text-gray-600 mt-1 space-x-3">
                                  <span>卸価格: ¥{product.price.toLocaleString()}</span>
                                  <span className="font-semibold text-blue-600">合計数: {totalQuantity}</span>
                                  <span className="font-semibold text-green-600">合計金額: ¥{totalAmount.toLocaleString()}</span>
                                </div>
                              </div>
                            </td>
                            {Array.from({ length: daysInMonth }, (_, i) => {
                              const day = i + 1;
                              const value = salesData[product.id]?.[day] || '';
                              return (
                                <td key={day} className="text-center p-0 border-l">
                                  <input
                                    type="number"
                                    value={value}
                                    onChange={(e) => handleQuantityChange(product.id, day, e.target.value)}
                                    className="w-full h-full text-center p-1 border-0 focus:bg-blue-50 focus:ring-1 focus:ring-blue-400 focus:outline-none"
                                    style={{ minWidth: '40px' }}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 操作ボタン */}
          <div className="flex gap-3 justify-center pb-2">
            <Button 
              size="sm" 
              className="gap-1 text-sm py-1 px-3"
              onClick={() => router.push('/wholesale/products')}
            >
              <Package className="w-3 h-3" />
              商品マスタ管理
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-sm py-1 px-3">
              <Users className="w-3 h-3" />
              取引先管理
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-sm py-1 px-3">
              <FileText className="w-3 h-3" />
              売上データ入力
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
