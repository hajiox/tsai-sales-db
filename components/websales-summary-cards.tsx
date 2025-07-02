// /components/websales-summary-cards.tsx ver.7 (新関数対応版)
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
          // 期間集計モード（既存ロジック）
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
          // 月別表示モード - 新しいデータベース関数を使用
          console.log('=== 新関数使用開始 ===');
          console.log('月:', month);
          
          // 金額計算関数を呼び出し
          const { data: financialData, error: financialError } = await supabase
            .rpc('get_monthly_financial_summary', { target_month: month });
          
          if (financialError) {
            console.error('Financial data error:', financialError);
            throw financialError;
          }
          
          console.log('Financial data:', financialData);
          
          // シリーズ別集計関数を呼び出し
          const { data: seriesData, error: seriesError } = await supabase
            .rpc('get_monthly_series_summary', { target_month: month });
          
          if (seriesError) {
            console.error('Series data error:', seriesError);
            throw seriesError;
          }
          
          console.log('Series data:', seriesData);
          
          // 金額データがある場合の処理
          if (financialData && financialData.length > 0) {
            const financial = financialData[0];
            
            // ECサイト別集計を新しい構造に変換
            const siteTotals: Totals = {
              amazon: { 
                count: financial.amazon_count || 0, 
                amount: financial.amazon_amount || 0 
              },
              rakuten: { 
                count: financial.rakuten_count || 0, 
                amount: financial.rakuten_amount || 0 
              },
              yahoo: { 
                count: financial.yahoo_count || 0, 
                amount: financial.yahoo_amount || 0 
              },
              mercari: { 
                count: financial.mercari_count || 0, 
                amount: financial.mercari_amount || 0 
              },
              base: { 
                count: financial.base_count || 0, 
                amount: financial.base_amount || 0 
              },
              qoo10: { 
                count: financial.qoo10_count || 0, 
                amount: financial.qoo10_amount || 0 
              }
            };
            
            console.log('Site totals:', siteTotals);
            setTotals(siteTotals);
          } else {
            // データがない場合はゼロで初期化
            const siteTotals: Totals = {};
            SITES.forEach(s => { siteTotals[s.key] = { count: 0, amount: 0 }; });
            setTotals(siteTotals);
          }
          
          // シリーズ別集計を新しい構造に変換
          if (seriesData && seriesData.length > 0) {
            const seriesSummaryData = seriesData.map((series: any) => ({
              seriesName: series.series_name || '未分類',
              count: series.series_count || 0,
              sales: series.series_amount || 0
            }));
            
            console.log('Series summary:', seriesSummaryData);
            setSeriesSummary(seriesSummaryData);
          } else {
            setSeriesSummary([]);
          }
          
          console.log('=== 新関数使用終了 ===');
        }
      } catch (error) {
        console.error('サマリーデータの読み込みに失敗しました:', error);
        // エラー時はゼロで初期化
        const siteTotals: Totals = {};
        SITES.forEach(s => { siteTotals[s.key] = { count: 0, amount: 0 }; });
        setTotals(siteTotals);
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

  // ECサイト別集計から総合計を計算
  const grandTotalCount = totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.count ?? 0), 0) : 0;
  const grandTotalSales = totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.amount ?? 0), 0) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 md:grid-cols-7 gap-4">
        <Card className="text-center bg-blue-50 border-blue-200">
          <CardHeader><CardTitle className="text-sm">総合計</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold">{formatNumber(grandTotalCount)} 件</d
