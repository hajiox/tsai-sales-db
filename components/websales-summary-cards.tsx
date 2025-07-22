// /components/websales-summary-cards.tsx ver.15 (広告費対応版)
"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "../lib/supabase"
import { TrendingUp } from "lucide-react"

const SITES = [
  { key: "amazon", name: "Amazon", bgColor: "bg-green-50", borderColor: "border-green-200" },
  { key: "rakuten", name: "楽天", bgColor: "bg-red-50", borderColor: "border-red-200" },
  { key: "yahoo", name: "Yahoo", bgColor: "bg-orange-50", borderColor: "border-orange-200" },
  { key: "mercari", name: "メルカリ", bgColor: "bg-yellow-50", borderColor: "border-yellow-200" },
  { key: "base", name: "BASE", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  { key: "qoo10", name: "Qoo10", bgColor: "bg-pink-50", borderColor: "border-pink-200" },
]

// 型定義
type Totals = Record<string, { 
  count: number; 
  amount: number; 
  profit: number; 
  adCost: number;
  finalProfit: number;
}>
type SeriesSummary = { 
  seriesName: string; 
  seriesCode: number;
  count: number; 
  sales: number; 
  profit: number; 
  adCost: number;
  finalProfit: number;
}
type TrendData = { 
  month_label: string; 
  sales: number; 
  profit: number; 
  ad_cost: number;
  final_profit: number;
}
type HoveredItem = { type: 'total' | 'site' | 'series'; key: string; name: string; }

type WebSalesSummaryCardsProps = {
  month: string; // "YYYY-MM"
  refreshTrigger?: number;
  viewMode?: 'month' | 'period';
  periodMonths?: number;
};

export default function WebSalesSummaryCards({ month, refreshTrigger, viewMode = 'month', periodMonths = 6 }: WebSalesSummaryCardsProps) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [seriesSummary, setSeriesSummary] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [hoveredItem, setHoveredItem] = useState<HoveredItem | null>(null);
  const [trendData, setTrendData] = useState<Record<string, TrendData[]>>({});
  const [trendLoading, setTrendLoading] = useState<Record<string, boolean>>({});
  
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchTrendData = async (item: HoveredItem) => {
    const trendKey = `${item.type}-${item.key}`;
    if (trendData[trendKey] || trendLoading[trendKey]) return;

    setTrendLoading(prev => ({ ...prev, [trendKey]: true }));

    try {
      const monthParam = month; // "YYYY-MM" 形式
      let rpcName = '';
      let rpcParams: any = {};

      switch (item.type) {
        case 'total':
          rpcName = 'get_total_trend_data';
          rpcParams = { target_month: monthParam };
          break;
        case 'site':
          rpcName = 'get_site_trend_data';
          rpcParams = { target_month: monthParam, target_site: item.key };
          break;
        case 'series':
          rpcName = 'get_series_trend_data';
          rpcParams = { target_month: monthParam, target_series: item.key };
          break;
      }

      if (!rpcName) return;

      const { data, error } = await supabase.rpc(rpcName, rpcParams);
      if (error) throw error;
      
      const formattedData = data.map((d: any) => ({
        month_label: d.month_label,
        sales: d.sales ?? d.series_amount ?? 0,
        profit: d.profit_amount ?? 0,
        ad_cost: d.ad_cost ?? 0,
        final_profit: d.final_profit ?? 0,
      }));

      setTrendData(prev => ({ ...prev, [trendKey]: formattedData }));

    } catch (error) {
      console.error(`トレンドデータの取得に失敗しました (${trendKey}):`, error);
      setTrendData(prev => ({ ...prev, [trendKey]: [] }));
    } finally {
      setTrendLoading(prev => ({ ...prev, [trendKey]: false }));
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [financialRes, seriesRes] = await Promise.all([
          supabase.rpc('get_monthly_financial_summary', { target_month: month }),
          supabase.rpc('get_monthly_series_summary', { target_month: month })
        ]);

        if (financialRes.error) throw financialRes.error;
        if (seriesRes.error) throw seriesRes.error;

        const financialData = financialRes.data;
        if (financialData && financialData.length > 0) {
            const financial = financialData[0];
            const siteTotals: Totals = {};
            SITES.forEach(s => {
                siteTotals[s.key] = {
                    count: financial[`${s.key}_count`] ?? 0,
                    amount: financial[`${s.key}_amount`] ?? 0,
                    profit: financial[`${s.key}_profit`] ?? 0,
                    adCost: financial[`${s.key}_ad_cost`] ?? 0,
                    finalProfit: financial[`${s.key}_final_profit`] ?? 0,
                }
            });
            setTotals(siteTotals);
        } else {
            const siteTotals: Totals = {};
            SITES.forEach(s => { 
              siteTotals[s.key] = { 
                count: 0, 
                amount: 0, 
                profit: 0, 
                adCost: 0,
                finalProfit: 0
              }; 
            });
            setTotals(siteTotals);
        }

        const seriesData = seriesRes.data;
        if (seriesData && seriesData.length > 0) {
            const seriesSummaryData = seriesData
              .map((s: any) => ({
                seriesName: s.series_name || '未分類',
                seriesCode: s.series_code || 0,
                count: s.series_count || 0,
                sales: s.series_amount || 0,
                profit: s.series_profit || 0,
                adCost: s.series_ad_cost || 0,
                finalProfit: s.series_final_profit || 0,
              }))
              .sort((a, b) => b.sales - a.sales);
            setSeriesSummary(seriesSummaryData);
        } else {
            setSeriesSummary([]);
        }

      } catch (error) {
        console.error('サマリーデータの読み込みに失敗しました:', error);
        const siteTotals: Totals = {};
        SITES.forEach(s => { 
          siteTotals[s.key] = { 
            count: 0, 
            amount: 0, 
            profit: 0, 
            adCost: 0,
            finalProfit: 0
          }; 
        });
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
    const elementRect = event.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if(containerRect) {
        setTooltipPosition({
            top: elementRect.bottom - containerRect.top + 8,
            left: elementRect.left - containerRect.left,
        });
    }
  };

  const handleMouseLeave = () => setHoveredItem(null);

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
  const grandTotalAdCost = totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.adCost ?? 0), 0) : 0;
  const grandTotalFinalProfit = totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.finalProfit ?? 0), 0) : 0;
  
  const currentTrendKey = hoveredItem ? `${hoveredItem.type}-${hoveredItem.key}` : null;

  return (
    <div className="space-y-6" ref={containerRef}>
      <div className="grid grid-cols-4 md:grid-cols-7 gap-4 relative">
        <Card 
          className="text-center bg-gray-50 border-gray-200 cursor-pointer"
          onMouseEnter={(e) => handleMouseEnter({ type: 'total', key: 'grandTotal', name: '総合計' }, e)}
          onMouseLeave={handleMouseLeave}
        >
          <CardHeader><CardTitle className="text-sm">総合計</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold">{formatNumber(grandTotalCount)} 件</div>
            <div className="text-sm text-gray-600">売上: ¥{formatNumber(grandTotalSales)}</div>
            <div className="text-sm text-red-600">広告費: ¥{formatNumber(grandTotalAdCost)}</div>
            <div className="text-sm font-bold text-green-600">利益: ¥{formatNumber(grandTotalFinalProfit)}</div>
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
              <div className="text-xs text-gray-500">売上: ¥{totals ? formatNumber(totals[s.key]?.amount ?? 0) : "-"}</div>
              <div className="text-xs text-red-600">広告: ¥{totals ? formatNumber(totals[s.key]?.adCost ?? 0) : "-"}</div>
              <div className="text-xs font-bold text-green-600">利益: ¥{totals ? formatNumber(totals[s.key]?.finalProfit ?? 0) : "-"}</div>
            </CardContent>
          </Card>
        ))}
      </div>

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
              <p className="text-xs text-gray-500">売上: ¥{formatNumber(series.sales)}</p>
              <p className="text-xs text-red-600">広告: ¥{formatNumber(series.adCost)}</p>
              <p className="text-xs font-bold text-green-600">利益: ¥{formatNumber(series.finalProfit)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      
      {currentTrendKey && (
        <div 
          className="absolute z-10 bg-white border border-gray-300 rounded-lg shadow-xl p-3"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            width: '380px',
          }}
        >
          <div className="text-sm font-semibold mb-2 text-gray-800">
            {hoveredItem?.name} - 過去6ヶ月 トレンド
          </div>
          
          {trendLoading[currentTrendKey] ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500"></div>
            </div>
          ) : trendData[currentTrendKey] && trendData[currentTrendKey].length > 0 ? (
            <div className="space-y-1.5">
              {trendData[currentTrendKey].map((trend, index) => {
                const maxSales = Math.max(...trendData[currentTrendKey].map(t => t.sales));
                const barWidth = maxSales > 0 ? (trend.sales / maxSales) * 100 : 0;
                
                return (
                  <div key={index} className="space-y-1">
                    <div className="grid grid-cols-3 gap-2 items-center text-xs">
                      <span className="text-gray-600 text-left">{trend.month_label}</span>
                      <div className="flex-1 h-4 bg-gray-100 rounded-sm overflow-hidden border border-gray-200">
                        <div 
                          className="h-full bg-sky-400 transition-all duration-300"
                          style={{ width: `${barWidth}%` }}
                        ></div>
                      </div>
                      <div className="text-right text-gray-800 font-mono text-xs">
                        <span>¥{formatNumber(trend.sales)}</span>
                      </div>
                    </div>
                    <div className="text-xs pl-[100px] space-y-0.5">
                      <div className="text-gray-600">広告費: ¥{formatNumber(trend.ad_cost)}</div>
                      <div className="text-green-600 font-semibold">利益: ¥{formatNumber(trend.final_profit)}</div>
                    </div>
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
