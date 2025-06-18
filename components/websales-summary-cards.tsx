"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "../lib/supabase"

const SITES = [
  { key: "amazon", name: "Amazon" },
  { key: "rakuten", name: "楽天" },
  { key: "yahoo", name: "Yahoo" },
  { key: "mercari", name: "メルカリ" },
  { key: "base", name: "BASE" },
  { key: "qoo10", name: "Qoo10" },
]

type Totals = Record<string, { count: number; amount: number }>

type SeriesSummary = {
  seriesName: string;
  count: number;
  sales: number;
}

export default function WebSalesSummaryCards({ month }: { month: string }) {
  const [totals, setTotals] = useState<Totals | null>(null)
  const [seriesSummary, setSeriesSummary] = useState<SeriesSummary[]>([])

  useEffect(() => {
    const fetchData = async () => {
      const start = `${month}-01`
      const next = new Date(start)
      next.setMonth(next.getMonth() + 1)
      const end = next.toISOString().slice(0, 10)

      // ECサイト別データ取得（元のロジック）
      const { data, error } = await supabase
        .from("web_sales")
        .select(
          "created_at, price, amazon, rakuten, yahoo, mercari, base, qoo10"
        )
        .gte("created_at", start)
        .lt("created_at", end)

      if (error) {
        console.error("fetch_error", error)
        return
      }

      const init: Totals = {}
      SITES.forEach((s) => {
        init[s.key] = { count: 0, amount: 0 }
      })

      ;(data || []).forEach((row: any) => {
        SITES.forEach((s) => {
          const qty = row[s.key] ?? 0
          const price = row.price ?? 0
          init[s.key].count += qty
          init[s.key].amount += qty * price
        })
      })

      setTotals(init)

      // シリーズ別データ取得（series_master結合）
      try {
        const { data: seriesData, error: seriesError } = await supabase.rpc("web_sales_full_month", {
          target_month: month,
        });

        if (seriesError) throw seriesError;

        // series_masterテーブルからシリーズ名を取得
        const { data: seriesMaster, error: masterError } = await supabase
          .from('series_master')
          .select('series_id, series_name');

        if (masterError) throw masterError;

        // シリーズマスタをMapに変換
        const seriesNameMap = new Map(
          seriesMaster.map(item => [item.series_id, item.series_name])
        );
        
        const rows = (seriesData as any[]) ?? [];
        
        // シリーズ別集計
        const seriesMap = new Map<string, { count: number; sales: number }>();

        rows.forEach((row: any) => {
          const seriesId = row.series_name;
          const seriesName = seriesNameMap.get(parseInt(seriesId)) || '未分類';
          const totalCount = (row.amazon_count || 0) + (row.rakuten_count || 0) + 
                            (row.yahoo_count || 0) + (row.mercari_count || 0) + 
                            (row.base_count || 0) + (row.qoo10_count || 0);
          const totalSales = totalCount * (row.price || 0);

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
        
      } catch (error) {
        console.error('シリーズデータ読み込みエラー:', error);
        setSeriesSummary([]);
      }
    }

    fetchData()
  }, [month])

  const f = (n: number) => new Intl.NumberFormat("ja-JP").format(n)

  return (
    <div className="space-y-6">
      {/* ECサイト別サマリー + 総合計 */}
      <div className="grid grid-cols-7 gap-4">
        {/* 総合計を左上に表示 */}
        <Card className="text-center bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="text-sm">総合計</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-xl font-bold">
              {seriesSummary.reduce((sum, s) => sum + s.count, 0).toLocaleString()} 件
            </div>
            <div className="text-sm text-gray-500">
              ¥{seriesSummary.reduce((sum, s) => sum + s.sales, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        {/* ECサイト別サマリー（6個） */}
        {SITES.map((s) => (
          <Card key={s.key}>
            <CardHeader>
              <CardTitle className="text-sm">{s.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-xl font-bold">
                {totals ? f(totals[s.key].count) : "-"} 件
              </div>
              <div className="text-sm text-gray-500">
                ¥{totals ? f(totals[s.key].amount) : "-"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* シリーズ別売上サマリー */}
      <div className="grid grid-cols-8 gap-3">
        {/* シリーズ別サマリー（全て表示） */}
        {seriesSummary.map((series) => (
          <Card key={series.seriesName} className="text-center">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold leading-tight">
                {series.seriesName}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              <div className="text-sm font-bold text-black">
                {f(series.count)}個
              </div>
              <div className="text-xs text-gray-500 font-semibold">
                ¥{f(series.sales)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
