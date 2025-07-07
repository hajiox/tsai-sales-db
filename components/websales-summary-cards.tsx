// /components/websales-summary-cards.tsx ver.11 (ECサイト別売上トレンド表示対応版)
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

type Totals = Record<string, { count: number; amount: number }>
type SeriesSummary = { seriesName: string; count: number; sales: number; }
type TrendData = { month: string; sales: number; }

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
  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);
  const [hoveredSite, setHoveredSite] = useState<string | null>(null);
  const [hoveredTotal, setHoveredTotal] = useState<boolean>(false);
  const [seriesTrendData, setSeriesTrendData] = useState<Record<string, TrendData[]>>({});
  const [siteTrendData, setSiteTrendData] = useState<Record<string, TrendData[]>>({});
  const [totalTrendData, setTotalTrendData] = useState<TrendData[]>([]);
  const [trendLoading, setTrendLoading] = useState<Record<string, boolean>>({});
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; right?: number }>({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const siteCardsRef = useRef<HTMLDivElement>(null);

  // シリーズ別トレンドデータを取得（既存）
  const fetchSeriesTrendData = async (seriesName: string) => {
    if (seriesTrendData[seriesName] || trendLoading[seriesName]) return;
    
    setTrendLoading(prev => ({ ...prev, [seriesName]: true }));
    
    try {
      const { data: trendData, error } = await supabase
        .rpc('get_series_trend_data', { 
          target_month: month, 
          target_series: seriesName 
        });
      
      if (!error && trendData) {
        const formattedTrendData = trendData.map((item: any) => ({
          month: item.month_label,
          sales: item.series_amount || 0
        }));
        
        setSeriesTrendData(prev => ({ ...prev, [seriesName]: formattedTrendData }));
      } else {
        console.error('トレンドデータ取得エラー:', error);
        setSeriesTrendData(prev => ({ ...prev, [seriesName]: [] }));
      }
    } catch (error) {
      console.error('トレンドデータ取得エラー:', error);
      setSeriesTrendData(prev => ({ ...prev, [seriesName]: [] }));
    } finally {
      setTrendLoading(prev => ({ ...prev, [seriesName]: false }));
    }
  };

  // ECサイト別トレンドデータを取得（修正版）
  const fetchSiteTrendData = async (siteKey: string) => {
    if (siteTrendData[siteKey] || trendLoading[`site_${siteKey}`]) return;
    
    setTrendLoading(prev => ({ ...prev, [`site_${siteKey}`]: true }));
    
    try {
      const { data: trendData, error } = await supabase
        .rpc('get_site_trend_data', { 
          target_month: month, 
          target_site: siteKey 
        });
      
      if (!error && trendData) {
        const formattedTrendData = trendData.map((item: any) => ({
          month: item.month_label,
          sales: item.site_amount || 0
        }));
        
        setSiteTrendData(prev => ({ ...prev, [siteKey]: formattedTrendData }));
      } else {
        console.error('サイトトレンドデータ取得エラー:', error);
        setSiteTrendData(prev => ({ ...prev, [siteKey]: [] }));
      }
    } catch (error) {
      console.error('サイトトレンドデータ取得エラー:', error);
      setSiteTrendData(prev => ({ ...prev, [siteKey]: [] }));
    } finally {
      setTrendLoading(prev => ({ ...prev, [`site_${siteKey}`]: false }));
    }
  };

  // 総合計トレンドデータを取得（修正版）
  const fetchTotalTrendData = async () => {
    if (totalTrendData.length > 0 || trendLoading['total']) return;
    
    setTrendLoading(prev => ({ ...prev, total: true }));
    
    try {
      const { data: trendData, error } = await supabase
        .rpc('get_total_trend_data', { 
          target_month: month
        });
      
      if (!error && trendData) {
        const formattedTrendData = trendData.map((item: any) => ({
          month: item.month_label,
          sales: item.total_amount || 0
        }));
        
        setTotalTrendData(formattedTrendData);
      } else {
        console.error('総合計トレンドデータ取得エラー:', error);
        setTotalTrendData([]);
      }
    } catch (error) {
      console.error('総合計トレンドデータ取得エラー:', error);
      setTotalTrendData([]);
    } finally {
      setTrendLoading(prev => ({ ...prev, total: false }));
    }
  };

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
          // 月別表示モード
          console.log('=== 新関数使用開始 ===');
          console.log('月:', month);
          
          const { data: financialData, error: financialError } = await supabase
            .rpc('get_monthly_financial_summary', { target_month: month });
          
          if (financialError) {
            console.error('Financial data error:', financialError);
            throw financialError;
          }
          
          const { data: seriesData, error: seriesError } = await supabase
            .rpc('get_monthly_series_summary', { target_month: month });
          
          if (seriesError) {
            console.error('Series data error:', seriesError);
            throw seriesError;
          }
          
          if (financialData && financialData.length > 0) {
            const financial = financialData[0];
            
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
            
            setTotals(siteTotals);
          } else {
            const siteTotals: Totals = {};
            SITES.forEach(s => { siteTotals[s.key] = { count: 0, amount: 0 }; });
            setTotals(siteTotals);
          }
          
          if (seriesData && seriesData.length > 0) {
            const seriesSummaryData = seriesData
              .map((series: any) => ({
                seriesName: series.series_name || '未分類',
                count: series.series_count || 0,
                sales: series.series_amount || 0
              }))
              .sort((a, b) => b.sales - a.sales);
            
            setSeriesSummary(seriesSummaryData);
          } else {
            setSeriesSummary([]);
          }
          
          console.log('=== 新関数使用終了 ===');
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
  }, [month, refreshTrigger, viewMode, periodMonths]);

  const formatNumber = (n: number) => new Intl.NumberFormat("ja-JP").format(n);

  const handleSeriesHover = (seriesName: string, event: React.MouseEvent<HTMLDivElement>) => {
    setHoveredSeries(seriesName);
    fetchSeriesTrendData(seriesName);

    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    
    if (containerRect) {
      const tooltipWidth = 200;
      const elementCenterX = rect.left + rect.width / 2 - containerRect.left;
      const containerWidth = containerRect.width;
      
      if (elementCenterX + tooltipWidth > containerWidth) {
        setTooltipPosition({
          top: rect.top - containerRect.top - 10,
          left: elementCenterX - tooltipWidth / 2,
        });
      } else {
        setTooltipPosition({
          top: rect.top - containerRect.top,
          left: rect.right - containerRect.left + 8,
        });
      }
    }
  };

  const handleSeriesLeave = () => {
    setHoveredSeries(null);
  };

  const handleSiteHover = (siteKey: string, event: React.MouseEvent<HTMLDivElement>) => {
    setHoveredSite(siteKey);
    fetchSiteTrendData(siteKey);

    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const containerRect = siteCardsRef.current?.getBoundingClientRect();
    
    if (containerRect) {
      const tooltipWidth = 200;
      setTooltipPosition({
        top: rect.bottom - containerRect.top + 8,
        left: rect.left + rect.width / 2 - containerRect.left - tooltipWidth / 2,
      });
    }
  };

  const handleSiteLeave = () => {
    setHoveredSite(null);
  };

  const handleTotalHover = (event: React.MouseEvent<HTMLDivElement>) => {
    setHoveredTotal(true);
    fetchTotalTrendData();

    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const containerRect = siteCardsRef.current?.getBoundingClientRect();
    
    if (containerRect) {
      const tooltipWidth = 200;
      setTooltipPosition({
        top: rect.bottom - containerRect.top + 8,
        left: rect.left + rect.width / 2 - containerRect.left - tooltipWidth / 2,
      });
    }
  };

  const handleTotalLeave = () => {
    setHoveredTotal(false);
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

  // トレンドデータ表示用の共通コンポーネント
  const renderTrendBars = (trendData: TrendData[]) => {
    if (!trendData || trendData.length === 0) {
      return <div className="text-xs text-gray-500 text-center">データがありません</div>;
    }

    const maxSales = Math.max(...trendData.map(t => t.sales));
    
    return (
      <div className="space-y-1">
        {trendData.map((trend, index) => {
          const barWidth = maxSales > 0 ? (trend.sales / maxSales) * 100 : 0;
          
          return (
            <div key={index} className="flex items-center justify-between text-xs">
              <span className="w-12 text-gray-600 text-left">{trend.month}</span>
              <div className="flex-1 mx-2 h-3 bg-gray-100 rounded-sm overflow-hidden">
                <div 
                  className="h-full bg-blue-400 transition-all duration-300"
                  style={{ width: `${barWidth}%` }}
                ></div>
              </div>
              <span className="w-16 text-right text-gray-700 font-mono text-xs">
                ¥{formatNumber(trend.sales)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div ref={siteCardsRef} className="grid grid-cols-4 md:grid-cols-7 gap-4 relative">
        <Card 
          className="text-center bg-gray-50 border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
          onMouseEnter={handleTotalHover}
          onMouseLeave={handleTotalLeave}
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
            className={`text-center ${s.bgColor} ${s.borderColor} cursor-pointer hover:shadow-md transition-shadow`}
            onMouseEnter={(e) => handleSiteHover(s.key, e)}
            onMouseLeave={handleSiteLeave}
          >
            <CardHeader><CardTitle className="text-sm">{s.name}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <div className="text-xl font-bold">{totals ? formatNumber(totals[s.key]?.count ?? 0) : "-"} 件</div>
              <div className="text-sm text-gray-500">¥{totals ? formatNumber(totals[s.key]?.amount ?? 0) : "-"}</div>
            </CardContent>
          </Card>
        ))}

        {/* ECサイト・総合計用ツールチップ */}
        {(hoveredSite || hoveredTotal) && (
          <div 
            className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3"
            style={{
              top: `${tooltipPosition.top}px`,
              left: `${tooltipPosition.left}px`,
              width: '200px'
            }}
          >
            <div className="text-xs font-semibold mb-2 text-gray-700">
              {hoveredTotal ? '総合計' : hoveredSite ? SITES.find(s => s.key === hoveredSite)?.name : ''} - 過去6ヶ月トレンド
            </div>
            
            {(hoveredTotal && trendLoading['total']) || (hoveredSite && trendLoading[`site_${hoveredSite}`]) ? (
              <div className="flex items-center justify-center h-16">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                <span className="ml-2 text-xs text-gray-500">読込中...</span>
              </div>
            ) : (
              renderTrendBars(hoveredTotal ? totalTrendData : siteTrendData[hoveredSite!] || [])
            )}
          </div>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>シリーズ別 売上サマリー</CardTitle></CardHeader>
        <CardContent ref={containerRef} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 relative">
          {seriesSummary.map((series) => (
            <div 
              key={series.seriesName} 
              className="text-center p-2 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors relative"
              onMouseEnter={(e) => handleSeriesHover(series.seriesName, e)}
              onMouseLeave={handleSeriesLeave}
            >
              <h4 className="text-xs font-semibold truncate" title={series.seriesName}>{series.seriesName}</h4>
              <p className="text-sm font-bold">{formatNumber(series.count)}個</p>
              <p className="text-xs text-gray-500">¥{formatNumber(series.sales)}</p>
            </div>
          ))}
          
          {/* シリーズ用ツールチップ（既存） */}
          {hoveredSeries && (
            <div 
              className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3"
              style={{
                top: `${tooltipPosition.top}px`,
                left: `${tooltipPosition.left}px`,
                width: '200px',
                transform: tooltipPosition.top < 100 ? 'translateY(-100%)' : 'none'
              }}
            >
              <div className="text-xs font-semibold mb-2 text-gray-700">
                {hoveredSeries} - 過去6ヶ月トレンド
              </div>
              
              {trendLoading[hoveredSeries] ? (
                <div className="flex items-center justify-center h-16">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                  <span className="ml-2 text-xs text-gray-500">読込中...</span>
                </div>
              ) : (
                renderTrendBars(seriesTrendData[hoveredSeries] || [])
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
