// /components/wholesale/ranking-cards.tsx ver.1
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, AlertCircle, TrendingUp } from 'lucide-react';

interface ProductRanking {
  id: string;
  name: string;
  totalQuantity: number;
  totalAmount: number;
  previousMonthQuantity?: number;
  growthRate?: number;
}

interface RankingCardsProps {
  products: any[];
  salesData: { [productId: string]: { [date: string]: number } };
  previousMonthData: { [productId: string]: { [date: string]: number } };
}

export default function RankingCards({ products, salesData, previousMonthData }: RankingCardsProps) {
  // 合計計算
  const calculateTotals = (productId: string) => {
    const sales = salesData[productId] || {};
    const totalQuantity = Object.values(sales).reduce((sum: number, qty: any) => sum + (qty || 0), 0);
    const product = products.find(p => p.id === productId);
    const totalAmount = totalQuantity * (product?.price || 0);
    return { totalQuantity, totalAmount };
  };

  // 前月合計計算
  const calculatePreviousMonthTotals = (productId: string) => {
    const sales = previousMonthData[productId] || {};
    const totalQuantity = Object.values(sales).reduce((sum: number, qty: any) => sum + (qty || 0), 0);
    return totalQuantity;
  };

  // ランキング計算
  const calculateRankings = (): { best10: ProductRanking[], worst5: ProductRanking[], growth5: ProductRanking[] } => {
    const rankings: ProductRanking[] = products.map(product => {
      const { totalQuantity, totalAmount } = calculateTotals(product.id);
      const previousMonthQuantity = calculatePreviousMonthTotals(product.id);
      const growthRate = previousMonthQuantity > 0 
        ? ((totalQuantity - previousMonthQuantity) / previousMonthQuantity) * 100 
        : totalQuantity > 0 ? 100 : 0;

      return {
        id: product.id,
        name: product.product_name,
        totalQuantity,
        totalAmount,
        previousMonthQuantity,
        growthRate
      };
    });

    // BEST10（売上数量降順）
    const best10 = [...rankings]
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 10);

    // ワースト5（売上数量昇順、0は除外）
    const worst5 = [...rankings]
      .filter(p => p.totalQuantity > 0)
      .sort((a, b) => a.totalQuantity - b.totalQuantity)
      .slice(0, 5);

    // 前月比増加ベスト5（増加率降順）
    const growth5 = [...rankings]
      .filter(p => p.growthRate > 0)
      .sort((a, b) => b.growthRate - a.growthRate)
      .slice(0, 5);

    return { best10, worst5, growth5 };
  };

  const { best10, worst5, growth5 } = calculateRankings();

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* BEST10 */}
      <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-yellow-900 flex items-center gap-1">
            <Sparkles className="w-4 h-4" />
            売上BEST10
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-3">
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {best10.map((item, index) => (
              <div key={item.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-yellow-700">{index + 1}.</span>
                  <span className="truncate max-w-[120px]">{item.name}</span>
                </div>
                <span className="font-semibold text-yellow-900">{item.totalQuantity}個</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ワースト5 */}
      <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-300">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-red-900 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            売上ワースト5
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-3">
          <div className="space-y-1">
            {worst5.map((item, index) => (
              <div key={item.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-red-700">{index + 1}.</span>
                  <span className="truncate max-w-[120px]">{item.name}</span>
                </div>
                <span className="font-semibold text-red-900">{item.totalQuantity}個</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 前月比増加ベスト5 */}
      <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-300">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-emerald-900 flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            前月比増加ベスト5
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-3">
          <div className="space-y-1">
            {growth5.map((item, index) => (
              <div key={item.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-emerald-700">{index + 1}.</span>
                  <span className="truncate max-w-[120px]">{item.name}</span>
                </div>
                <span className="font-semibold text-emerald-900">+{item.growthRate.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
