// /app/wholesale/dashboard/page.tsx ver.6 (レイアウト改善版)
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
                <CardTitle className="text-sm font-medium text-green-900 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  OEM商品
                </CardTitle>
              </CardHeader>
              <CardContent className="py-1 px-3">
                <div className="text-lg font-bold text-green-900">0 件</div>
                <div className="text-xs text-green-700">¥0</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium text-purple-900 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  取引先
                </CardTitle>
              </CardHeader>
              <CardContent className="py-1 px-3">
                <div className="text-lg font-bold text-purple-900">0 社</div>
                <div className="text-xs text-purple-700">卸先・OEM発注者</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium text-orange-900 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  合計金額
                </CardTitle>
              </CardHeader>
              <CardContent className="py-1 px-3">
                <div className="text-lg font-bold text-orange-900">¥{grandTotal.toLocaleString()}</div>
                <div className="text-xs text-orange-700">当月売上</div>
              </CardContent>
            </Card>
          </div>

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
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2 font-medium text-gray-700 sticky left-0 bg-gray-50 min-w-[180px]">商品情報</th>
                      {/* 日付列 */}
                      {Array.from({ length: daysInMonth }, (_, i) => (
                        <th key={i + 1} className="text-center p-1 font-medium text-gray-700 min-w-[50px]">
                          {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr className="text-center">
                        <td colSpan={daysInMonth + 1} className="py-6 text-gray-500">
                          読み込み中...
                        </td>
                      </tr>
                    ) : (
                      products.map((product) => {
                        const { totalQuantity, totalAmount } = calculateTotals(product.id);
                        return (
                          <tr key={product.id} className="border-b hover:bg-gray-50">
                            <td className="text-left p-2 sticky left-0 bg-white border-r">
                              <div>
                                <div className="font-medium text-gray-900">{product.product_name}</div>
                                <div className="text-xs text-gray-600 mt-1 space-x-3">
                                  <span>卸価格: ¥{product.price.toLocaleString()}</span>
                                  <span className="font-semibold text-blue-600">合計数: {totalQuantity}</span>
                                  <span className="font-semibold text-green-600">合計金額: ¥{totalAmount.toLocaleString()}</span>
                                </div>
                              </div>
                            </td>
                            {/* 日付列 */}
                            {Array.from({ length: daysInMonth }, (_, i) => {
                              const day = i + 1;
                              const value = salesData[product.id]?.[day] || '';
                              return (
                                <td key={day} className="text-center p-0 border-l">
                                  <input
                                    type="number"
                                    value={value}
                                    onChange={(e) => handleQuantityChange(product.id, day, e.target.value)}
                                    className="w-full text-center p-1 border-0 focus:bg-blue-50 focus:outline-none"
                                    style={{ minWidth: '50px' }}
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
            <Button size="sm" className="gap-1 text-sm py-1 px-3">
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
