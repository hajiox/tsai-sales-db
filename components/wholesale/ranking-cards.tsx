// /components/wholesale/ranking-cards.tsx ver.2
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
    <div className="space-y-4">
      {/* BEST10 - 上段10枚 */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
          <Sparkles className="w-4 h-4 text-yellow-600" />
          売上BEST10
        </h3>
        <div className="grid grid-cols-10 gap-2">
          {best10.map((item, index) => (
            <Card key={item.id} className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300">
              <CardHeader className="py-1 px-2">
                <CardTitle className="text-xs font-bold text-yellow-900 text-center">
                  {index + 1}位
                </CardTitle>
              </CardHeader>
              <CardContent className="py-1 px-2">
                <div className="text-center">
                  <div className="text-xs font-medium text-yellow-800 truncate mb-1">
                    {item.name}
                  </div>
                  <div className="text-xs font-bold text-yellow-900">
                    {item.totalQuantity}個
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 下段：ワースト5 + 前月比増加ベスト5 */}
      <div className="grid grid-cols-2 gap-4">
        {/* ワースト5 - 左側5枚 */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
            <AlertCircle className="w-4 h-4 text-red-600" />
            売上ワースト5
          </h3>
          <div className="grid grid-cols-5 gap-2">
            {worst5.map((item, index) => (
              <Card key={item.id} className="bg-gradient-to-br from-red-50 to-red-100 border-red-300">
                <CardHeader className="py-1 px-2">
                  <CardTitle className="text-xs font-bold text-red-900 text-center">
                    {index + 1}位
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-1 px-2">
                  <div className="text-center">
                    <div className="text-xs font-medium text-red-800 truncate mb-1">
                      {item.name}
                    </div>
                    <div className="text-xs font-bold text-red-900">
                      {item.totalQuantity}個
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* 前月比増加ベスト5 - 右側5枚 */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            前月比増加ベスト5
          </h3>
          <div className="grid grid-cols-5 gap-2">
            {growth5.map((item, index) => (
              <Card key={item.id} className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-300">
                <CardHeader className="py-1 px-2">
                  <CardTitle className="text-xs font-bold text-emerald-900 text-center">
                    {index + 1}位
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-1 px-2">
                  <div className="text-center">
                    <div className="text-xs font-medium text-emerald-800 truncate mb-1">
                      {item.name}
                    </div>
                    <div className="text-xs font-bold text-emerald-900">
                      +{item.growthRate.toFixed(0)}%
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
