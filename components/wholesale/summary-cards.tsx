// /components/wholesale/summary-cards.tsx ver.5 5枚構成版
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Package, FileText, Calendar, CalendarDays } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Product {
  id: string;
  product_name: string;
  price: number;
  profit_rate: number;
}

interface SalesData {
  [productId: string]: { [date: string]: number | undefined; };
}

interface SummaryCardsProps {
  products: Product[];
  salesData: SalesData;
  oemSalesCount: number;
  oemTotal: number;
  selectedYear: string;
  selectedMonth: string;
}

export default function SummaryCards({ 
  products, 
  salesData,
  oemSalesCount = 0,
  oemTotal = 0,
  selectedYear,
  selectedMonth
}: SummaryCardsProps) {
  const [historicalData, setHistoricalData] = useState<any>({
    months6: { count: 0, amount: 0, profit: 0 },
    months12: { count: 0, amount: 0, profit: 0 }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedYear || !selectedMonth) return;
    fetchHistoricalData();
  }, [selectedYear, selectedMonth]);

  const fetchHistoricalData = async () => {
    setLoading(true);
    try {
      // 統計APIから過去データを取得
      const response = await fetch(
        `/api/wholesale/products/statistics?year=${selectedYear}&month=${selectedMonth}`
      );
      const data = await response.json();
      
      if (data.success) {
        // 全商品の統計を集計
        let months6Count = 0;
        let months6Amount = 0;
        let months6Profit = 0;
        let months12Count = 0;
        let months12Amount = 0;
        let months12Profit = 0;

        data.statistics.forEach((stat: any) => {
          // 6ヶ月集計
          months6Count += stat.months_6_quantity;
          months6Amount += stat.months_6_amount;
          months6Profit += Math.floor(stat.months_6_amount * (stat.profit_rate / 100));
          
          // 12ヶ月集計
          months12Count += stat.months_12_quantity;
          months12Amount += stat.months_12_amount;
          months12Profit += Math.floor(stat.months_12_amount * (stat.profit_rate / 100));
        });

        setHistoricalData({
          months6: { count: months6Count, amount: months6Amount, profit: months6Profit },
          months12: { count: months12Count, amount: months12Amount, profit: months12Profit }
        });
      }
    } catch (error) {
      console.error('履歴データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  // 当月の卸商品集計
  const currentMonthWholesaleStats = () => {
    let totalCount = 0;
    let totalAmount = 0;
    let totalProfit = 0;

    products.forEach(product => {
      const productSales = salesData[product.id] || {};
      const quantity = Object.values(productSales).reduce((sum, qty) => sum + (qty || 0), 0);
      const amount = quantity * product.price;
      const profit = Math.floor(amount * (product.profit_rate / 100));

      totalCount += quantity;
      totalAmount += amount;
      totalProfit += profit;
    });

    return { count: totalCount, amount: totalAmount, profit: totalProfit };
  };

  const wholesaleStats = currentMonthWholesaleStats();
  const totalAmount = wholesaleStats.amount + oemTotal;
  const totalCount = wholesaleStats.count + oemSalesCount;
  const totalProfit = wholesaleStats.profit; // OEMの利益率が不明なため卸のみ

  return (
    <div className="grid grid-cols-5 gap-3">
      {/* ①全合計（卸+OEM） */}
      <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-blue-900 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            今月合計
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-3">
          <div className="text-xs text-blue-700">
            件数: {totalCount}件
          </div>
          <div className="text-sm font-bold text-blue-900">
            ¥{totalAmount.toLocaleString()}
          </div>
          <div className="text-xs text-blue-600">
            卸+OEM
          </div>
        </CardContent>
      </Card>

      {/* ②卸のみ */}
      <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-indigo-900 flex items-center gap-1">
            <Package className="w-3 h-3" />
            卸商品
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-3">
          <div className="text-xs text-indigo-700">
            件数: {wholesaleStats.count}件
          </div>
          <div className="text-sm font-bold text-indigo-900">
            ¥{wholesaleStats.amount.toLocaleString()}
          </div>
          <div className="text-xs text-indigo-600">
            利益: ¥{wholesaleStats.profit.toLocaleString()}
          </div>
        </CardContent>
      </Card>

      {/* ③OEMのみ */}
      <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-green-900 flex items-center gap-1">
            <FileText className="w-3 h-3" />
            OEM商品
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-3">
          <div className="text-xs text-green-700">
            件数: {oemSalesCount}件
          </div>
          <div className="text-sm font-bold text-green-900">
            ¥{oemTotal.toLocaleString()}
          </div>
          <div className="text-xs text-green-600">
            {selectedYear}年{selectedMonth}月
          </div>
        </CardContent>
      </Card>

      {/* ④過去6ヶ月 */}
      <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-purple-900 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            過去6ヶ月
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-3">
          <div className="text-xs text-purple-700">
            件数: {loading ? '...' : historicalData.months6.count.toLocaleString()}件
          </div>
          <div className="text-sm font-bold text-purple-900">
            ¥{loading ? '...' : historicalData.months6.amount.toLocaleString()}
          </div>
          <div className="text-xs text-purple-600">
            利益: ¥{loading ? '...' : historicalData.months6.profit.toLocaleString()}
          </div>
        </CardContent>
      </Card>

      {/* ⑤過去12ヶ月 */}
      <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-orange-900 flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            過去12ヶ月
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-3">
          <div className="text-xs text-orange-700">
            件数: {loading ? '...' : historicalData.months12.count.toLocaleString()}件
          </div>
          <div className="text-sm font-bold text-orange-900">
            ¥{loading ? '...' : historicalData.months12.amount.toLocaleString()}
          </div>
          <div className="text-xs text-orange-600">
            利益: ¥{loading ? '...' : historicalData.months12.profit.toLocaleString()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
