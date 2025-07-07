// /app/wholesale/dashboard/page.tsx ver.11 (入力ロジック修正、ヘッダー固定版)
"use client"

import { useState, useEffect, KeyboardEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Users, TrendingUp, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SummaryCards from '@/components/wholesale/summary-cards';
import RankingCards from '@/components/wholesale/ranking-cards';

interface Product {
  id: string;
  product_name: string;
  price: number;
  [key: string]: any;
}

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
  const [products, setProducts] = useState<Product[]>([]);
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
    // （変更なし）
  };
  
  const fetchPreviousMonthData = async () => {
    // （変更なし）
  };

  // ★修正点：入力が確実に反映されるよう、Reactの推奨する関数型のstate更新方法に変更
  const handleQuantityChange = (productId: string, day: number, value: string) => {
    const quantity = parseInt(value, 10);
    setSalesData(prev => {
      const newProdSales = { ...(prev[productId] || {}) };
      if (!isNaN(quantity) && quantity > 0) {
        newProdSales[day] = quantity;
      } else {
        delete newProdSales[day];
      }
      return {
        ...prev,
        [productId]: newProdSales,
      };
    });
  };

  const handleInputBlur = async (productId: string, day: number) => {
    await saveSalesData(productId, day);
  };

  const handleInputKeyDown = async (e: KeyboardEvent<HTMLInputElement>, productId: string, day: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await saveSalesData(productId, day);
      (e.target as HTMLInputElement).blur(); // フォーカスを外す
    }
  };
  
  const saveSalesData = async (productId: string, day: number) => {
    const quantity = salesData[productId]?.[day] || 0;
    const product = products.find(p => p.id === productId);
    if (!product) return;

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

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    // （変更なし）
  });

  const getDaysInMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };

  const daysInMonth = getDaysInMonth();

  const calculateTotals = (productId: string) => {
    // （変更なし）
  };

  const grandTotal = products.reduce((sum, product) => {
    // （変更なし）
  }, 0);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b flex-shrink-0 z-30">
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
        <div className="max-w-full mx-auto space-y-4">
          {/* サマリーカード */}
          <SummaryCards products={products} grandTotal={grandTotal} />

          {/* ランキングカード */}
          <RankingCards 
            products={products}
            salesData={salesData}
            previousMonthData={previousMonthData}
          />

          {/* 日別実績テーブル */}
          <Card className="flex-1 flex flex-col" style={{height: 'calc(100vh - 350px)'}}>
            <CardHeader className="py-2 px-4 border-b">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                日別売上実績
              </CardTitle>
            </CardHeader>
            {/* ★修正点：テーブルのコンテナに高さを設定し、縦スクロール可能に */}
            <CardContent className="p-0 overflow-auto flex-1">
              <table className="w-full text-xs border-collapse">
                {/* ★修正点：theadをstickyにしてヘッダーを固定 */}
                <thead className="sticky top-0 z-20 bg-gray-50">
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-gray-700 sticky left-0 bg-gray-50 z-30 min-w-[180px] border-r">商品情報</th>
                    {Array.from({ length: daysInMonth }, (_, i) => (
                      <th key={i + 1} className="text-center p-1 font-medium text-gray-700 min-w-[36px] border-l">
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={daysInMonth + 1} className="text-center py-6">読み込み中...</td></tr>
                  ) : products.length === 0 ? (
                    <tr><td colSpan={daysInMonth + 1} className="text-center py-6">商品データがありません。</td></tr>
                  ) : (
                    products.map((product) => {
                      const { totalQuantity, totalAmount } = calculateTotals(product.id);
                      return (
                        <tr key={product.id} className="border-b hover:bg-gray-50">
                          {/* ★修正点：商品情報列も他の要素と重ならないようz-indexを調整 */}
                          <td className="text-left p-2 sticky left-0 bg-white hover:bg-gray-50 border-r z-10">
                            <div className="w-[160px]">
                              <div className="font-medium text-gray-900 break-words">{product.product_name}</div>
                              <div className="text-xs text-gray-600 mt-1">
                                <span>卸価格: ¥{product.price.toLocaleString()}</span>
                                <span className="font-semibold text-blue-600 ml-2">合計: {totalQuantity}</span>
                              </div>
                              <div className="text-xs text-gray-600 font-semibold text-green-600">
                                <span>金額: ¥{totalAmount.toLocaleString()}</span>
                              </div>
                            </div>
                          </td>
                          {Array.from({ length: daysInMonth }, (_, i) => {
                            const day = i + 1;
                            const value = salesData[product.id]?.[day] || '';
                            return (
                              <td key={day} className="text-center p-0 border-l">
                                <input
                                  type="text"
                                  pattern="\d*"
                                  value={value}
                                  onChange={(e) => handleQuantityChange(product.id, day, e.target.value)}
                                  onBlur={() => handleInputBlur(product.id, day)}
                                  onKeyDown={(e) => handleInputKeyDown(e, product.id, day)}
                                  className="w-full h-full text-center p-1 bg-transparent border-0 focus:bg-blue-100 focus:ring-1 focus:ring-blue-400 focus:outline-none"
                                  style={{ minWidth: '36px' }}
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
            </CardContent>
          </Card>

          {/* 操作ボタン */}
          <div className="flex gap-3 justify-center pt-4 pb-2">
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
