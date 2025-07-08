// /app/wholesale/dashboard/page.tsx ver.14 (画面表示修正版)
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
  [productId: string]: {
    [date: string]: number;
  };
}

interface MonthOption {
  value: string;
  label: string;
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

  // マウント確認用Effect
  useEffect(() => {
    setMounted(true);
  }, []);

  // 月オプション設定Effect
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

  // データ取得Effect
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
        setProducts(data);
      }
    } catch (error) {
      console.error('商品データ取得エラー:', error);
    }
  };

  const fetchSalesData = async (month: string) => {
    try {
      const response = await fetch(`/api/wholesale/sales?month=${month}`);
      if (response.ok) {
        const data = await response.json();
        setSalesData(data);
      }
    } catch (error) {
      console.error('売上データ取得エラー:', error);
    }
  };

  const fetchPreviousMonthData = async (month: string) => {
    try {
      const [year, monthNum] = month.split('-').map(Number);
      const prevDate = new Date(year, monthNum - 2, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      
      const response = await fetch(`/api/wholesale/sales?month=${prevMonth}`);
      if (response.ok) {
        const data = await response.json();
        setPreviousMonthData(data);
      }
    } catch (error) {
      console.error('前月データ取得エラー:', error);
    }
  };

  const handleQuantityChange = (productId: string, day: number, value: string) => {
    const quantity = parseInt(value) || 0;
    setSalesData(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [day]: quantity
      }
    }));
  };

  const saveSalesData = async () => {
    try {
      const response = await fetch('/api/wholesale/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, salesData })
      });
      
      if (response.ok) {
        alert('保存しました');
      }
    } catch (error) {
      console.error('保存エラー:', error);
    }
  };

  const getDaysInMonth = () => {
    if (!selectedMonth) return 31;
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };

  // マウント前は何も表示しない
  if (!mounted) {
    return null;
  }

  // ローディング中表示
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div>読み込み中...</div>
      </div>
    );
  }

  const daysInMonth = getDaysInMonth();

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="bg-white shadow-sm border-b px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">卸販売管理</h1>
          <div className="flex gap-3">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {monthOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button onClick={saveSalesData}>保存</Button>
            <Button 
              variant="outline" 
              onClick={() => router.push('/wholesale/products')}
            >
              商品管理
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          <SummaryCards 
            products={products}
            salesData={salesData}
            previousMonthData={previousMonthData}
            selectedMonth={selectedMonth}
          />
          
          <RankingCards 
            products={products}
            salesData={salesData}
            previousMonthData={previousMonthData}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                売上入力
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-3 py-2 text-left font-medium">商品名</th>
                      {Array.from({ length: daysInMonth }, (_, i) => (
                        <th key={i + 1} className="border border-gray-300 px-2 py-2 text-center font-medium w-16">
                          {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-3 py-2 font-medium bg-gray-50">
                          {product.product_name}
                        </td>
                        {Array.from({ length: daysInMonth }, (_, i) => (
                          <td key={i + 1} className="border border-gray-300 p-1">
                            <input
                              type="number"
                              min="0"
                              value={salesData[product.id]?.[i + 1] || ''}
                              onChange={(e) => handleQuantityChange(product.id, i + 1, e.target.value)}
                              className="w-full px-1 py-1 text-center border-0 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                                if (e.key === 'Enter') {
                                  const nextInput = e.currentTarget.closest('td')?.nextElementSibling?.querySelector('input') as HTMLInputElement;
                                  if (nextInput) {
                                    nextInput.focus();
                                  }
                                }
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
