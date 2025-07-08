// /app/wholesale/dashboard/page.tsx ver.20 (根本対策版)
"use client"

export const dynamic = 'force-dynamic';

import { useState, useEffect, KeyboardEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Users, TrendingUp, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SummaryCards from '@/components/wholesale/summary-cards';
import RankingCards from '@/components/wholesale/ranking-cards';

// Interfaces (変更なし)
interface Product { id: string; product_name: string; price: number; [key: string]: any; }
interface SalesData { [productId: string]: { [date: string]: number | undefined; }; }
interface MonthOption { value: string; label: string; }

export default function WholesaleDashboard() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState('');
  const [monthOptions, setMonthOptions] = useState<MonthOption[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [salesData, setSalesData] = useState<SalesData>({});
  const [previousMonthData, setPreviousMonthData] = useState<SalesData>({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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
        await Promise.all([ fetchProducts(), fetchSalesData(selectedMonth), fetchPreviousMonthData(selectedMonth) ]);
      } catch (error) { console.error('一括データ取得エラー:', error); } 
      finally { setLoading(false); }
    };
    fetchAllData();
  }, [selectedMonth, mounted]);

  const fetchProducts = async () => { /* データ取得関数は変更なしのため省略 */ };
  const fetchSalesData = async (month: string) => { /* データ取得関数は変更なしのため省略 */ };
  const fetchPreviousMonthData = async (month: string) => { /* データ取得関数は変更なしのため省略 */ };

  const handleQuantityChange = (productId: string, day: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    setSalesData(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [day]: value === '' ? undefined : parseInt(value, 10),
      }
    }));
  };

  const saveSalesData = async (productId: string, day: number) => { /* 保存関数は変更なしのため省略 */ };
  const handleInputKeyDown = async (e: KeyboardEvent<HTMLInputElement>, productId: string, day: number) => { /* Enterキー処理は変更なしのため省略 */ };
  const getDaysInMonth = () => { /* 日数計算関数は変更なしのため省略 */ };
  const calculateTotals = (productId: string) => { /* 合計計算関数は変更なしのため省略 */ };
  const grandTotal = products.reduce((sum, product) => { /* 総合計計算は変更なしのため省略 */ }, 0);
  
  if (!mounted) {
    return <div className="flex items-center justify-center h-screen"><p>読み込み中...</p></div>;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 1. ページヘッダー */}
      <header className="flex-shrink-0 bg-white shadow-sm border-b z-30">
        <div className="px-4 py-2 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">卸販売管理システム</h1>
          <div className="flex items-center gap-3">
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-8 px-2 py-1 text-sm rounded-md border border-input bg-background"
              disabled={loading}
            >
              {monthOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* 2. メインコンテンツエリア */}
      <main className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><p>データを読み込んでいます...</p></div>
        ) : (
          <>
            {/* 上段：サマリーとランキング（この部分はスクロールしない） */}
            <div className="flex-shrink-0 space-y-4">
              <SummaryCards products={products} grandTotal={grandTotal} />
              <RankingCards products={products} salesData={salesData} previousMonthData={previousMonthData} />
            </div>

            {/* 下段：日別実績テーブル（この部分だけがスクロールする） */}
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="flex-shrink-0 py-2 px-4 border-b">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> 日別売上実績
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto p-0">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-gray-100">
                    <tr className="border-b">
                      <th className="sticky left-0 bg-gray-100 z-20 p-2 text-left font-semibold text-gray-700 min-w-[180px] border-r">商品情報</th>
                      {Array.from({ length: getDaysInMonth() }, (_, i) => (
                        <th key={i + 1} className="p-1 text-center font-semibold text-gray-600 min-w-[40px] border-l">{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(product => {
                      const { totalQuantity, totalAmount } = calculateTotals(product.id);
                      return (
                        <tr key={product.id} className="border-b hover:bg-gray-50">
                          <td className="sticky left-0 bg-white hover:bg-gray-50 z-20 p-2 border-r">
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
                            const value = salesData[product.id]?.[day];
                            return (
                              <td key={day} className="text-center p-0 border-l">
                                <input
                                  type="text"
                                  pattern="\d*"
                                  value={value ?? ''}
                                  onChange={(e) => handleQuantityChange(product.id, day, e.target.value)}
                                  onBlur={() => saveSalesData(product.id, day)}
                                  onKeyDown={(e) => handleInputKeyDown(e, product.id, day)}
                                  className="w-full h-full text-center p-1 bg-transparent border-0 focus:bg-blue-100 focus:ring-1 focus:ring-blue-400 focus:outline-none"
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
          </>
        )}
      </main>
    </div>
  );
}
