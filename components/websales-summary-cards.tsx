// /components/websales-summary-cards.tsx ver.13 (トレンド機能拡張 総合対応版)
"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "../lib/supabase"

const SITES = [
  { key: "amazon", name: "Amazon", bgColor: "bg-green-50", borderColor: "border-green-200" },
  { key: "rakuten", name: "楽天", bgColor: "bg-red-50", borderColor: "border-red-200" },
  { key: "yahoo", name: "Yahoo", bgColor: "bg-orange-50", borderColor: "border-orange-200" },
  { key: "mercari", name: "メルカリ", bgColor: "bg-yellow-50", borderColor: "border-yellow-200" },
  { key: "base", name: "BASE", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  { key: "qoo10", name: "Qoo10", bgColor: "bg-pink-50", borderColor: "border-pink-200" },
]

// 型定義
type Totals = Record<string, { count: number; amount: number }>
type SeriesSummary = { seriesName: string; count: number; sales: number; }
type TrendData = { month_label: string; sales: number; }
type HoveredItem = { type: 'total' | 'site' | 'series'; key: string; name: string; }

type WebSalesSummaryCardsProps = {
  month: string; // "YYYY-MM"
  refreshTrigger?: number;
};

export default function WebSalesSummaryCards({ month, refreshTrigger }: WebSalesSummaryCardsProps) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [seriesSummary, setSeriesSummary] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  
  // トレンド表示関連のState
  const [hoveredItem, setHoveredItem] = useState<HoveredItem | null>(null);
  const [trendData, setTrendData] = useState<Record<string, TrendData[]>>({});
  const [trendLoading, setTrendLoading] = useState<Record<string, boolean>>({});
  
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // トレンドデータを取得する汎用関数
  const fetchTrendData = async (item: HoveredItem) => {
    const trendKey = `${item.type}-${item.key}`;
    if (trendData[trendKey] || trendLoading[trendKey]) return;

    setTrendLoading(prev => ({ ...prev, [trendKey]: true }));

    try {
      const dateParam = `${month}-01`; // "YYYY-MM-DD"形式に
      let rpcName = '';
      let rpcParams: any = {};

      switch (item.type) {
        case 'total':
          rpcName = 'get_total_trend_data';
          rpcParams = { target_month: dateParam };
          break;
        case 'site':
          rpcName = 'get_site_trend_data';
          rpcParams = { target_month: dateParam, target_site: item.key };
          break;
        case 'series':
          rpcName = 'get_series_trend_data';
          rpcParams = { target_month: dateParam, target_series: item.key };
          break;
      }

      if (!rpcName) return;

      const { data, error } = await supabase.rpc(rpcName, rpcParams);

      if (error) {
        throw error;
      }
      
      // データ構造の差異を吸収 (seriesはseries_amount、他はsales)
      const formattedData = data.map((d: any) => ({
        month_label: d.month_label,
        sales: d.sales ?? d.series_amount ?? 0
      }));

      setTrendData(prev => ({ ...prev, [trendKey]: formattedData }));

    } catch (error) {
      console.error(`トレンドデータの取得に失敗しました (${trendKey}):`, error);
      setTrendData(prev => ({ ...prev, [trendKey]: [] })); // エラー時は空データをセット
    } finally {
      setTrendLoading(prev => ({ ...prev, [trendKey]: false }));
    }
  };

  // メインのサマリーデータを取得
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // DB関数を並列で呼び出し
        const [financialRes, seriesRes] = await Promise.all([
          supabase.rpc('get_monthly_financial_summary', { target_month: month }),
          supabase.rpc('get_monthly_series_summary', { target_month: month })
        ]);

        if (financialRes.error) throw financialRes.error;
        if (seriesRes.error) throw seriesRes.error;

        // 金額サマリーの処理
        const financialData = financialRes.data;
        if (financialData && financialData.length > 0) {
            const financial = financialData[0];
            const siteTotals: Totals = {};
            SITES.forEach(s => {
                siteTotals[s.key] = {
                    count: financial[`${s.key}_count`] ?? 0,
                    amount: financial[`${s.key}_amount`] ?? 0
                }
            });
            setTotals(siteTotals);
        } else {
            const siteTotals: Totals = {};
            SITES.forEach(s => { siteTotals[s.key] = { count: 0, amount: 0 }; });
            setTotals(siteTotals);
        }

        // シリーズサマリーの処理
        const seriesData = seriesRes.data;
        if (seriesData && seriesData.length > 0) {
            const seriesSummaryData = seriesData
              .map((s: any) => ({
                seriesName: s.series_name || '未分類',
                count: s.series_count || 0,
                sales: s.series_amount || 0
              }))
              .sort((a, b) => b.sales - a.sales);
            setSeriesSummary(seriesSummaryData);
        } else {
            setSeriesSummary([]);
        }

      } catch (error) {
        console.error('サマリーデータの読み込みに失敗しました:', error);
        const siteTotals: Totals = {};
        SITES.forEach(s => { siteTotals[s.key] = { count: 0, amount: 0 }; });
        setTotals(siteTotals);
        setSeriesSummary([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [month, refreshTrigger]);

  const formatNumber = (n: number) => new Intl.NumberFormat("ja-JP").format(n);

  const handleMouseEnter = (item: HoveredItem, event: React.MouseEvent<HTMLDivElement>) => {
    setHoveredItem(item);
    fetchTrendData(item);
    
    // ツールチップの位置計算
    const elementRect = event.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if(containerRect) {
        setTooltipPosition({
            top: elementRect.bottom - containerRect.top + 8,
            left: elementRect.left - containerRect.left,
        });
    }
  };

  const handleMouseLeave = () => {
    setHoveredItem(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
        <p className="ml-4 text-gray-600">サマリーデータを読み込み中...</p>
      </div>
    );
  }

  const grandTotalCount = totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.count ?? 0), 0) : 0;
  const grandTotalSales = totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.amount ?? 0), 0) : 0;
  
  const currentTrendKey = hoveredItem ? `${hoveredItem.type}-${hoveredItem.key}` : null;

  return (
    <div className="space-y-6" ref={containerRef}>
      {/* --- ECサイト別カード --- */}
      <div className="grid grid-cols-4 md:grid-cols-7 gap-4 relative">
        <Card 
          className="text-center bg-gray-50 border-gray-200 cursor-pointer"
          onMouseEnter={(e) => handleMouseEnter({ type: 'total', key: 'grandTotal', name: '総合計' }, e)}
          onMouseLeave={handleMouseLeave}
        >
          <CardHeader><CardTitle className="text-sm">総合計</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold">{formatNumber(grandTotalCount)} 件</div>
            <div className="text-sm text-gray-600">¥{formatNumber(grandTotalSales)}</div>
          </CardContent>
        </Card>

        {SITES.map((s) => (
          <Card 
            key={s.key} 
            className={`text-center ${s.bgColor} ${s.borderColor} cursor-pointer`}
            onMouseEnter={(e) => handleMouseEnter({ type: 'site', key: s.key, name: s.name }, e)}
            onMouseLeave={handleMouseLeave}
          >
            <CardHeader><CardTitle className="text-sm">{s.name}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <div className="text-xl font-bold">{totals ? formatNumber(totals[s.key]?.count ?? 0) : "-"} 件</div>
              <div className="text-sm text-gray-500">¥{totals ? formatNumber(totals[s.key]?.amount ?? 0) : "-"}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* --- シリーズ別サマリー --- */}
      <Card>
        <CardHeader><CardTitle>シリーズ別 売上サマリー</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 relative">
          {seriesSummary.map((series) => (
            <div 
              key={series.seriesName} 
              className="text-center p-2 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors relative"
              onMouseEnter={(e) => handleMouseEnter({ type: 'series', key: series.seriesName, name: series.seriesName }, e)}
              onMouseLeave={handleMouseLeave}
            >
              <h4 className="text-xs font-semibold truncate" title={series.seriesName}>{series.seriesName}</h4>
              <p className="text-sm font-bold">{formatNumber(series.count)}個</p>
              <p className="text-xs text-gray-500">¥{formatNumber(series.sales)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      
      {/* --- 共通ツールチップ --- */}
      {hoveredItem && currentTrendKey && (
        <div 
          className="absolute z-10 bg-white border border-gray-300 rounded-lg shadow-xl p-3"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            width: '280px',
          }}
        >
          <div className="text-sm font-semibold mb-2 text-gray-800">
            {hoveredItem.name} - 過去6ヶ月 売上トレンド
          </div>
          
          {trendLoading[currentTrendKey] ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500"></div>
              <span className="ml-3 text-sm text-gray-500">トレンド読込中...</span>
            </div>
          ) : trendData[currentTrendKey] && trendData[currentTrendKey].length > 0 ? (
            <div className="space-y-1.5">
              {trendData[currentTrendKey].map((trend, index) => {
                const maxSales = Math.max(...trendData[currentTrendKey].map(t => t.sales));
                const barWidth = maxSales > 0 ? (trend.sales / maxSales) * 100 : 0;
                
                return (
                  <div key={index} className="flex items-center justify-between text-xs">
                    <span className="w-16 text-gray-600 text-left">{trend.month_label}</span>
                    <div className="flex-1 mx-2 h-4 bg-gray-100 rounded-sm overflow-hidden border border-gray-200">
                      <div 
                        className="h-full bg-sky-400 transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      ></div>
                    </div>
                    <span className="w-20 text-right text-gray-800 font-mono">
                      ¥{formatNumber(trend.sales)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-gray-500 text-center h-24 flex items-center justify-center">
              トレンドデータがありません
            </div>
          )}
        </div>
      )}
    </div>
  );
}
