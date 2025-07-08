// /app/wholesale/dashboard/page.tsx ver.18 (UI修正版)
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
  [productId: string]: { [date: string]: number | undefined; }; // undefinedを許容
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
        // データ取得ロジックは変更なし
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

  const fetchProducts = async () => { /* 変更なし */ };
  const fetchSalesData = async (month: string) => { /* 変更なし */ };
  const fetchPreviousMonthData = async (month: string) => { /* 変更なし */ };

  // ★修正点１：数字入力のロジックをよりシンプルで確実なものに変更
  const handleQuantityChange = (productId: string, day: number, value: string) => {
    // 数字と空文字列以外は無視する
    if (!/^\d*$/.test(value)) {
      return;
    }
    
    setSalesData(prev => {
      const newProdSales = { ...(prev[productId] || {}) };
      
      if (value === '') {
        // 入力が空なら、その日のデータを削除
        delete newProdSales[day];
      } else {
        // 数字が入力されたら、数値に変換して設定
        newProdSales[day] = parseInt(value, 10);
      }
      
      return { ...prev, [productId]: newProdSales };
    });
  };

  const saveSalesData = async (productId: string, day: number) => { /* 変更なし */ };
  const handleInputKeyDown = async (e: KeyboardEvent<HTMLInputElement>, productId: string, day: number) => { /* 変更なし */ };
  const getDaysInMonth = () => { /* 変更なし */ };
  const calculateTotals = (productId: string) => { /* 変更なし */ };
  const grandTotal = products.reduce((sum, product) => { /* 変更なし */ }, 0);
  
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
        { /* ヘッダー部分は変更なし */ }
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

            {/* ★修正点２：カードのflexとoverflowの指定を修正し、ヘッダー固定を確実にする */}
            <Card className="flex-1 flex flex-col overflow-hidden">
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
                            const value = salesData[product.id]?.[day];
                            return (
                              <td key={day} className="text-center p-0 border-l">
                                <input
                                  type="text"
                                  pattern="\d*"
                                  // valueが0の場合も表示されるように修正
                                  value={value === undefined ? '' : String(value)}
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
              { /* 操作ボタン部分は変更なし */ }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
