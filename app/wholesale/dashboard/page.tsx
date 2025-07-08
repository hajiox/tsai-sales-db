// /app/wholesale/dashboard/page.tsx ver.17 (データ加工処理修正版)
"use client"

export const dynamic = 'force-dynamic';

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
  [productId: string]: { [date: string]: number; };
}
interface MonthOption {
  value: string;
  label:string;
}

export default function WholesaleDashboard() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState('');
  const [monthOptions, setMonthOptions] = useState<MonthOption[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [salesData, setSalesData] = useState<SalesData>({});
  const [previousMonthData, setPreviousMonthData] = useState<SalesData>({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const options: MonthOption[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({
        value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月`
      });
    }
    setMonthOptions(options);
    if (options.length > 0) {
      setSelectedMonth(options[0].value);
    }
  }, [mounted]);

  useEffect(() => {
    if (!selectedMonth || !mounted) return;
    const fetchAllData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchProducts(),
          fetchSalesData(selectedMonth),
          fetchPreviousMonthData(selectedMonth)
        ]);
      } catch (error) {
        console.error('データ取得エラー:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAllData();
  }, [selectedMonth, mounted]);

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/wholesale/products');
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products);
        }
      }
    } catch (error) {
      console.error('商品データ取得エラー:', error);
    }
  };

  // ★修正点：APIから受け取った売上配列をオブジェクトに加工する処理を追加
  const fetchSalesData = async (month: string) => {
    try {
      const response = await fetch(`/api/wholesale/sales?month=${month}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.sales)) {
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
      }
    } catch (error) {
      console.error('売上データ取得エラー:', error);
    }
  };
  
  // ★修正点：前月データも同様に加工処理を追加
  const fetchPreviousMonthData = async (month: string) => {
    try {
      const [year, monthNum] = month.split('-').map(Number);
      const prevDate = new Date(year, monthNum - 2, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const response = await fetch(`/api/wholesale/sales?month=${prevMonth}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.sales)) {
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
      }
    } catch (error) {
      console.error('前月データ取得エラー:', error);
    }
  };

  const handleQuantityChange = (productId: string, day: number, value: string) => {
    const quantity = parseInt(value, 10);
    setSalesData(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [day]: isNaN(quantity) ? undefined : quantity,
      }
    }));
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
        body: JSON.stringify({ productId, saleDate, quantity, unitPrice: product.price })
      });
    } catch (error) {
      console.error('保存エラー:', error);
    }
  };
  
  const handleInputKeyDown = async (e: KeyboardEvent<HTMLInputElement>, productId: string, day: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await saveSalesData(productId, day);
      (e.target as HTMLInputElement).blur();
    }
  };
  
  const getDaysInMonth = () => {
    if (!selectedMonth) return new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };
  
  const calculateTotals = (productId: string) => {
    const sales = salesData[productId] || {};
    const totalQuantity = Object.values(sales).reduce((sum, qty) => sum + (qty || 0), 0);
    const product = products.find(p => p.id === productId);
    const totalAmount = totalQuantity * (product?.price || 0);
    return { totalQuantity, totalAmount };
  };

  const grandTotal = products.reduce((sum, product) => {
    const { totalAmount } = calculateTotals(product.id);
    return sum + totalAmount;
  }, 0);
  
  if (!mounted) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

 return (
    <div className="h-screen flex flex-col bg-gray-50">
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
                disabled={loading}
              >
                {monthOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <p className="text-gray-500">データを読み込んでいます...</p>
          </div>
        ) : (
          <div className="max-w-full mx-auto space-y-4">
            <SummaryCards products={products} grandTotal={grandTotal} />
            <RankingCards products={products} salesData={salesData} previousMonthData={previousMonthData} />

            <Card className="flex-1 flex flex-col" style={{minHeight: '400px'}}>
              <CardHeader className="py-2 px-4 border-b">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  日別売上実績
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-auto flex-1">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-20 bg-gray-100">
                    <tr className="border-b">
                      <th className="text-left p-2 font-semibold text-gray-700 sticky left-0 bg-gray-100 z-30 min-w-[180px] border-r">商品情報</th>
                      {Array.from({ length: getDaysInMonth() }, (_, i) => (
                        <th key={i + 1} className="text-center p-1 font-semibold text-gray-600 min-w-[38px] border-l">
                          {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => {
                      const { totalQuantity, totalAmount } = calculateTotals(product.id);
                      return (
                        <tr key={product.id} className="border-b hover:bg-gray-50">
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
                          {Array.from({ length: getDaysInMonth() }, (_, i) => {
                            const day = i + 1;
                            const value = salesData[product.id]?.[day] || '';
                            return (
                              <td key={day} className="text-center p-0 border-l">
                                <input
                                  type="text"
                                  pattern="\d*"
                                  value={value}
                                  onChange={(e) => handleQuantityChange(product.id, day, e.target.value)}
                                  onBlur={() => saveSalesData(product.id, day)}
                                  onKeyDown={(e) => handleInputKeyDown(e, product.id, day)}
                                  className="w-full h-full text-center p-1 bg-transparent border-0 focus:bg-blue-100 focus:ring-1 focus:ring-blue-400 focus:outline-none"
                                  style={{ minWidth: '38px' }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <div className="flex gap-3 justify-center pt-4 pb-2">
              <Button size="sm" onClick={() => router.push('/wholesale/products')}>
                <Package className="w-3 h-3 mr-1" />
                商品マスタ管理
              </Button>
              <Button size="sm" variant="outline">
                <Users className="w-3 h-3 mr-1" />
                取引先管理
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
