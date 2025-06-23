// /components/websales-summary-cards.tsx ver.6 (集計統一版)
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "../lib/supabase"

const SITES = [
  { key: "amazon_count", name: "Amazon" },
  { key: "rakuten_count", name: "楽天" },
  { key: "yahoo_count", name: "Yahoo" },
  { key: "mercari_count", name: "メルカリ" },
  { key: "base_count", name: "BASE" },
  { key: "qoo10_count", name: "Qoo10" },
]

type Totals = Record<string, { count: number; amount: number }>
type SeriesSummary = { seriesName: string; count: number; sales: number; }

type WebSalesSummaryCardsProps = {
  month: string;
  refreshTrigger?: number;
  viewMode: 'month' | 'period';
  periodMonths: 6 | 12;
};

export default function WebSalesSummaryCards({ 
  month, 
  refreshTrigger,
  viewMode,
  periodMonths
}: WebSalesSummaryCardsProps) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [seriesSummary, setSeriesSummary] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (viewMode === 'period') {
          // 期間集計モード
          const res = await fetch('/api/web-sales-period', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_month: month, period_months: periodMonths }),
          });
          if (!res.ok) throw new Error(`API Error: ${res.status}`);
          const data = await res.json();
          setTotals(data.totals);
          setSeriesSummary(data.seriesSummary);
        } else {
          // 月別表示モード
          console.log('=== デバッグ開始 ===');
          console.log('月:', month);
          
          const { data, error } = await supabase.rpc("web_sales_full_month", { 
            target_month: month 
          });
          console.log('Supabaseレスポンス:', { data, error });
          
          if (error) throw error;
          const rows = (data as any[]) ?? [];
          console.log('取得した行数:', rows.length);
          console.log('最初の3行:', rows.slice(0, 3));

          // ECサイト別集計
          const siteTotals: Totals = {};
          SITES.forEach(s => { siteTotals[s.key] = { count: 0, amount: 0 }; });
          
          rows.forEach((row: any, index: number) => {
            if (index < 3) {
              console.log(`行${index}の詳細:`, row);
            }
            SITES.forEach(s => {
              const qty = row[s.key] ?? 0;
              const price = row.price ?? 0;
              if (qty > 0 && index < 3) {
                console.log(`  ${s.name}: 数量=${qty}, 価格=${price}`);
              }
              siteTotals[s.key].count += qty;
              siteTotals[s.key].amount += qty * price;
            });
          });
          
          console.log('集計結果:', siteTotals);
          setTotals(siteTotals);

          // シリーズ別集計
          const seriesMap = new Map<string, { count: number, sales: number }>();
          rows.forEach((row: any) => {
            const seriesName = row.series_name || '未分類';
            
            const totalCount = SITES.reduce((sum, s) => sum + (row[s.key] || 0), 0);
            const totalSales = totalCount * (row.price || 0);
            
            if (!seriesMap.has(seriesName)) seriesMap.set(seriesName, { count: 0, sales: 0 });
            const existing = seriesMap.get(seriesName)!;
            existing.count += totalCount;
            existing.sales += totalSales;
          });

          const sortedSeries = Array.from(seriesMap.entries())
            .map(([seriesName, data]) => ({ seriesName, ...data }))
            .sort((a, b) => b.sales - a.sales);
          setSeriesSummary(sortedSeries);
          
          console.log('=== デバッグ終了 ===');
        }
      } catch (error) {
        console.error('サマリーデータの読み込みに失敗しました:', error);
        setTotals(null);
        setSeriesSummary([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [month, refreshTrigger, viewMode, periodMonths]);

  const formatNumber = (n: number) => new Intl.NumberFormat("ja-JP").format(n);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
        <p className="ml-4 text-gray-600">サマリーデータを読み込み中...</p>
      </div>
    );
  }

  // 🔧 修正: ECサイト別集計から総合計を計算（テーブルと同じ計算方法）
  const grandTotalCount = totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.count ?? 0), 0) : 0;
  const grandTotalSales = totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.amount ?? 0), 0) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 md:grid-cols-7 gap-4">
        <Card className="text-center bg-blue-50 border-blue-200">
          <CardHeader><CardTitle className="text-sm">総合計</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold">{formatNumber(grandTotalCount)} 件</div>
            <div className="text-sm text-gray-600">¥{formatNumber(grandTotalSales)}</div>
          </CardContent>
        </Card>
        {SITES.map((s) => (
          <Card key={s.key}>
            <CardHeader><CardTitle className="text-sm">{s.name}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <div className="text-xl font-bold">{totals ? formatNumber(totals[s.key]?.count ?? 0) : "-"} 件</div>
              <div className="text-sm text-gray-500">¥{totals ? formatNumber(totals[s.key]?.amount ?? 0) : "-"}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>シリーズ別 売上サマリー</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {seriesSummary.map((series) => (
            <div key={series.seriesName} className="text-center p-2 border rounded-md">
              <h4 className="text-xs font-semibold truncate" title={series.seriesName}>{series.seriesName}</h4>
              <p className="text-sm font-bold">{formatNumber(series.count)}個</p>
              <p className="text-xs text-gray-500">¥{formatNumber(series.sales)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
