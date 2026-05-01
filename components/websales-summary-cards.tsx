// /components/websales-summary-cards.tsx ver.17 (目標達成率対応版)
"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import { TrendingUp, Target } from "lucide-react"

const SITES = [
  { key: "amazon", name: "Amazon", bgColor: "bg-green-50", borderColor: "border-green-200" },
  { key: "rakuten", name: "楽天", bgColor: "bg-red-50", borderColor: "border-red-200" },
  { key: "yahoo", name: "Yahoo", bgColor: "bg-orange-50", borderColor: "border-orange-200" },
  { key: "mercari", name: "メルカリ", bgColor: "bg-yellow-50", borderColor: "border-yellow-200" },
  { key: "base", name: "BASE", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  { key: "qoo10", name: "Qoo10", bgColor: "bg-pink-50", borderColor: "border-pink-200" },
  { key: "tiktok", name: "TikTok", bgColor: "bg-teal-50", borderColor: "border-teal-200" },
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
  const supabase = getSupabaseBrowserClient();
  const [totals, setTotals] = useState<Totals | null>(null);
  const [seriesSummary, setSeriesSummary] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [rpcTotalAdCost, setRpcTotalAdCost] = useState(0);
  const [rpcTotalFinalProfit, setRpcTotalFinalProfit] = useState(0);
  const [webTarget, setWebTarget] = useState(0);
  const [lastYearTotals, setLastYearTotals] = useState<Totals | null>(null);

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
        const lastYearMonth = `${parseInt(month.split('-')[0]) - 1}-${month.split('-')[1]}`;
        const [financialRes, seriesRes, targetRes, lastYearRes] = await Promise.all([
          supabase.rpc('get_monthly_financial_summary', { target_month: month }),
          supabase.rpc('get_monthly_series_summary', { target_month: month }),
          fetch(`/api/kpi/web-target?month=${month}`).then(r => r.json()).catch(() => ({ target: 0 })),
          supabase.rpc('get_monthly_financial_summary', { target_month: lastYearMonth })
        ]);

        if (financialRes.error) throw financialRes.error;
        if (seriesRes.error) throw seriesRes.error;
        setWebTarget(targetRes.target ?? 0);

        const financialData = financialRes.data;
        if (financialData && financialData.length > 0) {
          const financial = financialData[0];
          // RPCのtotal値を保存（サイト別合計では拾えないGoogle広告費等を含む）
          setRpcTotalAdCost(financial.total_ad_cost ?? 0);
          setRpcTotalFinalProfit(financial.total_final_profit ?? 0);
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

        const lastYearData = lastYearRes.data;
        if (lastYearData && lastYearData.length > 0) {
          const financialLY = lastYearData[0];
          const siteTotalsLY: Totals = {};
          SITES.forEach(s => {
            siteTotalsLY[s.key] = {
              count: financialLY[`${s.key}_count`] ?? 0,
              amount: financialLY[`${s.key}_amount`] ?? 0,
              profit: financialLY[`${s.key}_profit`] ?? 0,
              adCost: financialLY[`${s.key}_ad_cost`] ?? 0,
              finalProfit: financialLY[`${s.key}_final_profit`] ?? 0,
            }
          });
          setLastYearTotals(siteTotalsLY);
        } else {
          setLastYearTotals(null);
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
        setLastYearTotals(null);
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
    if (containerRect) {
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
  const grandTotalAdCost = rpcTotalAdCost || (totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.adCost ?? 0), 0) : 0);
  const grandTotalFinalProfit = rpcTotalFinalProfit || (totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.finalProfit ?? 0), 0) : 0);
  const grandTotalSalesLastYear = lastYearTotals ? SITES.reduce((sum, s) => sum + (lastYearTotals[s.key]?.amount ?? 0), 0) : 0;

  const currentTrendKey = hoveredItem ? `${hoveredItem.type}-${hoveredItem.key}` : null;

  return (
    <div className="space-y-6 relative" ref={containerRef}>
      <div className="grid grid-cols-4 md:grid-cols-8 gap-4 relative">
        <Card
          className="text-center bg-gray-50 border-gray-200 cursor-pointer flex flex-col justify-between col-span-1"
          onMouseEnter={(e) => handleMouseEnter({ type: 'total', key: 'grandTotal', name: '総合計' }, e)}
          onMouseLeave={handleMouseLeave}
        >
          <div>
            <CardHeader><CardTitle className="text-sm">総合計</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-bold">{formatNumber(grandTotalCount)} 件</div>
              <div className="text-sm text-gray-600">売上: ¥{formatNumber(grandTotalSales)}</div>
              <div className="text-sm text-red-600">広告費: ¥{formatNumber(grandTotalAdCost)}</div>
              <div className="text-sm font-bold text-green-600">利益: ¥{formatNumber(grandTotalFinalProfit)}</div>
              {webTarget > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-center gap-1 text-xs text-gray-500 mb-1">
                    <Target className="w-3 h-3" />
                    <span>目標: ¥{formatNumber(webTarget)}</span>
                  </div>
                  {(() => {
                    const rate = Math.round((grandTotalSales / webTarget) * 1000) / 10;
                    const rateColor = rate >= 100 ? 'text-green-600' : rate >= 50 ? 'text-yellow-600' : 'text-red-600';
                    const bgColor = rate >= 100 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-500';
                    return (
                      <>
                        <div className={`text-lg font-bold ${rateColor}`}>
                          {rate}%
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${bgColor} rounded-full transition-all duration-500`}
                            style={{ width: `${Math.min(rate, 100)}%` }}
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </div>
          {grandTotalSalesLastYear > 0 && (
            <div className="px-4 pb-4">
              <div className="pt-2 mt-1 border-t border-gray-300">
                <div className="text-xs text-gray-500">前年度売上: ¥{formatNumber(grandTotalSalesLastYear)}</div>
                <div className={`text-sm font-bold ${grandTotalSales >= grandTotalSalesLastYear ? 'text-blue-600' : 'text-red-600'}`}>
                  前年比: {Math.round((grandTotalSales / grandTotalSalesLastYear) * 100)}%
                </div>
              </div>
            </div>
          )}
        </Card>

        {SITES.map((s) => {
          const currentSales = totals ? (totals[s.key]?.amount ?? 0) : 0;
          const lySales = lastYearTotals ? (lastYearTotals[s.key]?.amount ?? 0) : 0;
          
          return (
          <Card
            key={s.key}
            className={`text-center flex flex-col justify-between ${s.bgColor} ${s.borderColor} cursor-pointer`}
            onMouseEnter={(e) => handleMouseEnter({ type: 'site', key: s.key, name: s.name }, e)}
            onMouseLeave={handleMouseLeave}
          >
            <div>
              <CardHeader><CardTitle className="text-sm">{s.name}</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                <div className="text-xl font-bold">{totals ? formatNumber(totals[s.key]?.count ?? 0) : "-"} 件</div>
                <div className="text-xs text-gray-500">売上: ¥{formatNumber(currentSales)}</div>
                <div className="text-xs text-red-600">広告: ¥{totals ? formatNumber(totals[s.key]?.adCost ?? 0) : "-"}</div>
                <div className="text-xs font-bold text-green-600">利益: ¥{totals ? formatNumber(totals[s.key]?.finalProfit ?? 0) : "-"}</div>
              </CardContent>
            </div>
            {lySales > 0 && (
              <div className="px-4 pb-4">
                <div className={`pt-2 mt-1 border-t ${s.borderColor} opacity-60`}>
                  <div className="text-[10px] text-gray-500">前年売上: ¥{formatNumber(lySales)}</div>
                  <div className={`text-xs font-bold ${currentSales >= lySales ? 'text-blue-600' : 'text-red-500'}`}>
                    前年比: {Math.round((currentSales / lySales) * 100)}%
                  </div>
                </div>
              </div>
            )}
          </Card>
        )})}
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
          className="absolute z-10 bg-white border border-gray-300 rounded-lg shadow-xl p-3 pointer-events-none"
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
