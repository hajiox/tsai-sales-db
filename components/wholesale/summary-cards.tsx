// /components/wholesale/summary-cards.tsx ver.4 4指標対応版
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Package, Calendar, CalendarDays } from 'lucide-react';
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
      // 過去6ヶ月と12ヶ月のデータを取得
      const endDate = new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 31);
      const start6Months = new Date(endDate);
      start6Months.setMonth(start6Months.getMonth() - 5);
      const start12Months = new Date(endDate);
      start12Months.setMonth(start12Months.getMonth() - 11);

      // 6ヶ月間のデータ取得
      const response6 = await fetch(
        `/api/wholesale/sales?startMonth=${start6Months.getFullYear()}-${String(start6Months.getMonth() + 1).padStart(2, '0')}&endMonth=${selectedYear}-${selectedMonth}`
      );
      const data6 = await response6.json();

      // 12ヶ月間のデータ取得
      const response12 = await fetch(
        `/api/wholesale/sales?startMonth=${start12Months.getFullYear()}-${String(start12Months.getMonth() + 1).padStart(2, '0')}&endMonth=${selectedYear}-${selectedMonth}`
      );
      const data12 = await response12.json();

      if (data6.success && data12.success) {
        // 商品情報をマップ化
        const productMap = new Map(products.map(p => [p.id, p]));

        // 6ヶ月集計
        const stats6 = calculateStats(data6.sales, productMap);
        // 12ヶ月集計
        const stats12 = calculateStats(data12.sales, productMap);

        setHistoricalData({
          months6: stats6,
          months12: stats12
        });
      }
    } catch (error) {
      console.error('履歴データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (sales: any[], productMap: Map<string, Product>) => {
    let totalCount = 0;
    let totalAmount = 0;
    let totalProfit = 0;

    sales.forEach((sale: any) => {
      const product = productMap.get(sale.product_id);
      if (product) {
        totalCount += sale.quantity;
        totalAmount += sale.amount;
        totalProfit += Math.floor(sale.amount * (product.profit_rate / 100));
      }
    });

    return { count: totalCount, amount: totalAmount, profit: totalProfit };
  };

  // 当月の集計
  const currentMonthStats = () => {
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

  const currentStats = currentMonthStats();
  const currentTotal = currentStats.amount + oemTotal;

  return (
    <div className="grid grid-cols-4 gap-3">
      {/* ①今月の合計 */}
      <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-blue-900 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            今月の合計
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-3">
          <div className="text-xs text-blue-700">
            件数: {currentStats.count + oemSalesCount}件
          </div>
          <div className="text-sm font-bold text-blue-900">
            ¥{currentTotal.toLocaleString()}
          </div>
          <div className="text-xs text-blue-600">
            利益: ¥{currentStats.profit.toLocaleString()}
          </div>
        </CardContent>
      </Card>

      {/* ②OEM商品 */}
      <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-green-900 flex items-center gap-1">
            <Package className="w-3 h-3" />
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

      {/* ③過去6ヶ月 */}
      <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-purple-900 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            過去6ヶ月
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-3">
          <div className="text-xs text-purple-700">
            件数: {loading ? '...' : historicalData.months6.count}件
          </div>
          <div className="text-sm font-bold text-purple-900">
            ¥{loading ? '...' : historicalData.months6.amount.toLocaleString()}
          </div>
          <div className="text-xs text-purple-600">
            利益: ¥{loading ? '...' : historicalData.months6.profit.toLocaleString()}
          </div>
        </CardContent>
      </Card>

      {/* ④過去12ヶ月 */}
      <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-orange-900 flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            過去12ヶ月
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-3">
          <div className="text-xs text-orange-700">
            件数: {loading ? '...' : historicalData.months12.count}件
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
