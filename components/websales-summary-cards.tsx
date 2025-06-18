"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "../lib/supabase"

type SeriesSummary = {
  seriesName: string;
  count: number;
  sales: number;
}

export default function WebSalesSummaryCards({ month }: { month: string }) {
  const [seriesSummary, setSeriesSummary] = useState<SeriesSummary[]>([])
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, error } = await supabase.rpc("web_sales_full_month", {
          target_month: month,
        });

        if (error) throw error;
        
        const rows = (data as any[]) ?? [];
        
        // シリーズ別集計
        const seriesMap = new Map<string, { count: number; sales: number }>();
        let grandTotal = 0;

        rows.forEach((row: any) => {
          const seriesName = row.series_name || '未分類';
          const totalCount = (row.amazon_count || 0) + (row.rakuten_count || 0) + 
                            (row.yahoo_count || 0) + (row.mercari_count || 0) + 
                            (row.base_count || 0) + (row.qoo10_count || 0);
          const totalSales = totalCount * (row.price || 0);
          
          grandTotal += totalCount;

          if (!seriesMap.has(seriesName)) {
            seriesMap.set(seriesName, { count: 0, sales: 0 });
          }
          const existing = seriesMap.get(seriesName)!;
          existing.count += totalCount;
          existing.sales += totalSales;
        });

        // 売上順にソート
        const sortedSeries = Array.from(seriesMap.entries())
          .map(([seriesName, data]) => ({
            seriesName,
            count: data.count,
            sales: data.sales
          }))
          .sort((a, b) => b.sales - a.sales);

        setSeriesSummary(sortedSeries);
        setTotalCount(grandTotal);
        
      } catch (error) {
        console.error('データ読み込みエラー:', error);
        setSeriesSummary([]);
        setTotalCount(0);
      }
    };

    fetchData();
  }, [month])

  const f = (n: number) => new Intl.NumberFormat("ja-JP").format(n)

  return (
    <div className="space-y-4">
      {/* 総販売数 */}
      <div className="bg-green-50 p-4 rounded-lg text-center">
        <h2 className="text-lg font-semibold mb-2">📊 {month}月 販売実績サマリー</h2>
        <div className="text-2xl font-bold text-green-600">
          総販売数: {f(totalCount)}個
        </div>
      </div>

      {/* シリーズ別売上サマリー */}
      <div className="grid grid-cols-8 gap-3">
        {seriesSummary.map((series) => (
          <Card key={series.seriesName} className="text-center">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                {series.seriesName}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              <div className="text-base font-bold text-blue-600">
                {f(series.count)}個
              </div>
              <div className="text-xs text-green-600 font-semibold">
                ¥{f(series.sales)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
