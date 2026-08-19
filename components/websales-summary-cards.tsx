// /components/websales-summary-cards.tsx ver.17 (目標達成率対応版)
"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Target } from "lucide-react"

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
  platformFees: number;
  paymentFees: number;
  ecFees: number;
  ecDeductions: number;
  promotions: number;
  refundEtc: number;
  adCost: number;
  finalProfit: number;
}>
type SeriesSummary = {
  seriesName: string;
  seriesCode: number;
  count: number;
  sales: number;
  profit: number;
  ecFees: number;
  ecDeductions: number;
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
type EcProfitSummary = {
  channels: Array<{
    channel: string;
    label: string;
    quantity: number;
    sales: number;
    productProfit: number;
    platformFees: number;
    paymentFees: number;
    sellerDiscounts: number;
    sellerCoupons: number;
    sellerPoints: number;
    refunds: number;
    shippingCosts: number;
    otherCosts: number;
    otherCredits: number;
    ecDeductions: number;
    directAdCost: number;
    finalProfit: number;
  }>;
  series: Array<{
    seriesName: string;
    seriesCode: number | null;
    count: number;
    sales: number;
    productProfit: number;
    ecFees: number;
    ecDeductions: number;
    adCost: number;
    finalProfit: number;
  }>;
  totals: {
    sales: number;
    platformFees: number;
    paymentFees: number;
    sellerDiscounts: number;
    sellerCoupons: number;
    sellerPoints: number;
    refunds: number;
    shippingCosts: number;
    otherCosts: number;
    otherCredits: number;
    ecDeductions: number;
    adCost: number;
    finalProfit: number;
  };
  comparisons: {
    previousMonth: ComparisonSummary;
    previousYear: ComparisonSummary;
  };
}
type ComparisonSummary = {
  month: string;
  channels: EcProfitSummary["channels"];
  totals: EcProfitSummary["totals"];
}
type HoveredItem = { type: 'total' | 'site' | 'series'; key: string; name: string; }

type WebSalesSummaryCardsProps = {
  month: string; // "YYYY-MM"
  refreshTrigger?: number;
  viewMode?: 'month' | 'period';
  periodMonths?: number;
  onTargetDataReady?: (data: { target: number; sales: number }) => void;
};

export default function WebSalesSummaryCards({ month, refreshTrigger, viewMode = 'month', periodMonths = 6, onTargetDataReady }: WebSalesSummaryCardsProps) {
  const supabase = getSupabaseBrowserClient();
  const [totals, setTotals] = useState<Totals | null>(null);
  const [seriesSummary, setSeriesSummary] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [rpcTotalAdCost, setRpcTotalAdCost] = useState(0);
  const [rpcTotalFinalProfit, setRpcTotalFinalProfit] = useState(0);
  const [profitSummary, setProfitSummary] = useState<EcProfitSummary | null>(null);
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
        if (viewMode === 'period') {
          // 期間集計APIを呼び出す
          const res = await fetch('/api/web-sales-period', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_month: month, period_months: periodMonths })
          });
          const periodData = await res.json();
          
          if (periodData.totals) {
            const siteTotals: Totals = {};
            SITES.forEach(s => {
              const ch = s.key;
              siteTotals[ch] = {
                count: periodData.totals[ch]?.count ?? 0,
                amount: periodData.totals[ch]?.amount ?? 0,
                profit: 0, // 期間集計では現在未対応
                platformFees: 0,
                paymentFees: 0,
                ecFees: 0,
                ecDeductions: 0,
                promotions: 0,
                refundEtc: 0,
                adCost: 0, // 期間集計では現在未対応
                finalProfit: 0 // 期間集計では現在未対応
              };
            });
            setTotals(siteTotals);
          } else {
            const siteTotals: Totals = {};
            SITES.forEach(s => {
              siteTotals[s.key] = emptySiteTotal();
            });
            setTotals(siteTotals);
          }
          
          if (periodData.seriesSummary) {
            setSeriesSummary(periodData.seriesSummary.map((s: any) => ({
              seriesName: s.seriesName,
              seriesCode: 0,
              count: s.count,
              sales: s.sales,
              profit: 0,
              ecFees: 0,
              ecDeductions: 0,
              adCost: 0,
              finalProfit: 0
            })));
          } else {
            setSeriesSummary([]);
          }
          
          // 期間表示時は目標値と前年比は非表示にする
          setWebTarget(0);
          setRpcTotalAdCost(0);
          setRpcTotalFinalProfit(0);
          setLastYearTotals(null);
          setProfitSummary(null);
        } else {
          // 月別表示（既存ロジック）
          const [profitPayload, targetRes] = await Promise.all([
            fetch(`/api/web-sales/ec-profit?month=${encodeURIComponent(month)}`, { cache: 'no-store' })
              .then(async (response) => {
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.error || 'EC利益サマリーを取得できませんでした');
                return payload as EcProfitSummary;
              }),
            fetch(`/api/kpi/web-target?month=${month}`).then(r => r.json()).catch(() => ({ target: 0 })),
          ]);

          setWebTarget(targetRes.target ?? 0);
          setProfitSummary(profitPayload);

          const profitByChannel = new Map(profitPayload.channels.map(row => [row.channel, row]));
          const siteTotals: Totals = {};
          SITES.forEach(s => {
            const row = profitByChannel.get(s.key);
            const promotions = (row?.sellerDiscounts ?? 0) + (row?.sellerCoupons ?? 0) + (row?.sellerPoints ?? 0);
            const refundEtc = (row?.refunds ?? 0) + (row?.shippingCosts ?? 0) + (row?.otherCosts ?? 0) - (row?.otherCredits ?? 0);
            siteTotals[s.key] = {
              count: row?.quantity ?? 0,
              amount: row?.sales ?? 0,
              profit: row?.productProfit ?? 0,
              platformFees: row?.platformFees ?? 0,
              paymentFees: row?.paymentFees ?? 0,
              ecFees: (row?.platformFees ?? 0) + (row?.paymentFees ?? 0),
              ecDeductions: row?.ecDeductions ?? 0,
              promotions,
              refundEtc,
              adCost: row?.directAdCost ?? 0,
              finalProfit: row?.finalProfit ?? 0,
            };
          });
          setRpcTotalAdCost(profitPayload.totals.adCost ?? 0);
          setRpcTotalFinalProfit(profitPayload.totals.finalProfit ?? 0);
          setTotals(siteTotals);

          setLastYearTotals(comparisonToTotals(profitPayload.comparisons.previousYear));
          setSeriesSummary((profitPayload.series || []).map((series) => ({
            seriesName: series.seriesName,
            seriesCode: series.seriesCode ?? 0,
            count: series.count,
            sales: series.sales,
            profit: series.productProfit,
            ecFees: series.ecFees,
            ecDeductions: series.ecDeductions,
            adCost: series.adCost,
            finalProfit: series.finalProfit,
          })));
        }
      } catch (error) {
        console.error('サマリーデータの読み込みに失敗しました:', error);
        const siteTotals: Totals = {};
        SITES.forEach(s => {
          siteTotals[s.key] = emptySiteTotal();
        });
        setTotals(siteTotals);
        setLastYearTotals(null);
        setSeriesSummary([]);
        setProfitSummary(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [month, refreshTrigger, viewMode, periodMonths]);

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

  const grandTotalCount = totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.count ?? 0), 0) : 0;
  const grandTotalSales = totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.amount ?? 0), 0) : 0;
  const grandTotalAdCost = viewMode === 'month'
    ? rpcTotalAdCost
    : (totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.adCost ?? 0), 0) : 0);
  const grandTotalFinalProfit = viewMode === 'month'
    ? rpcTotalFinalProfit
    : (totals ? SITES.reduce((sum, s) => sum + (totals[s.key]?.finalProfit ?? 0), 0) : 0);
  const grandTotalEcFees = profitSummary
    ? profitSummary.totals.platformFees + profitSummary.totals.paymentFees
    : 0;
  const grandTotalEcDeductions = profitSummary?.totals.ecDeductions ?? 0;
  const grandTotalSalesLastYear = lastYearTotals ? SITES.reduce((sum, s) => sum + (lastYearTotals[s.key]?.amount ?? 0), 0) : 0;
  // 目標データを親コンポーネントに通知（前回値と比較して変化時のみ）
  const prevTargetRef = useRef<{ target: number; sales: number }>({ target: 0, sales: 0 });
  useEffect(() => {
    if (onTargetDataReady && viewMode === 'month') {
      const prev = prevTargetRef.current;
      if (prev.target !== webTarget || prev.sales !== grandTotalSales) {
        prevTargetRef.current = { target: webTarget, sales: grandTotalSales };
        onTargetDataReady({ target: webTarget, sales: grandTotalSales });
      }
    }
  }, [webTarget, grandTotalSales, viewMode]);

  const currentTrendKey = hoveredItem ? `${hoveredItem.type}-${hoveredItem.key}` : null;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
        <p className="ml-4 text-gray-600">サマリーデータを読み込み中...</p>
      </div>
    );
  }


  return (
    <div className="space-y-3 relative" ref={containerRef}>
      <div className="relative grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8 xl:gap-3">
        <Card
          className="min-h-[230px] text-center bg-gray-50 border-gray-200 cursor-pointer flex flex-col justify-between col-span-1"
          onMouseEnter={(e) => handleMouseEnter({ type: 'total', key: 'grandTotal', name: '総合計' }, e)}
          onMouseLeave={handleMouseLeave}
        >
          <div>
            <CardHeader className="py-2 px-3"><CardTitle className="text-xs">総合計</CardTitle></CardHeader>
            <CardContent className="space-y-0.5 py-1 px-3">
              <div className="text-xl font-bold">¥{formatNumber(grandTotalSales)}</div>
              <div className="text-xs text-gray-600">{formatNumber(grandTotalCount)}個</div>
              {viewMode === 'month' && (
                <>
                  <div className="text-xs text-amber-700">EC手数料: ¥{formatNumber(grandTotalEcFees)}</div>
                  <div className="text-xs text-orange-700">EC控除計: ¥{formatNumber(grandTotalEcDeductions)}</div>
                  <div className="text-[10px] font-semibold text-orange-700">売上比 {formatPercent(grandTotalEcDeductions, grandTotalSales)}</div>
                  <div className="text-xs text-red-600">広告費: ¥{formatNumber(grandTotalAdCost)}</div>
                  <div className="text-xs font-bold text-green-600">利益: ¥{formatNumber(grandTotalFinalProfit)}</div>
                </>
              )}
            </CardContent>
          </div>
          {grandTotalSalesLastYear > 0 && (
            <div className="px-3 pb-2">
              <div className="pt-1 mt-1 border-t border-gray-300">
                <div className="text-[10px] text-gray-500">前年度売上: ¥{formatNumber(grandTotalSalesLastYear)}</div>
                <div className={`text-xs font-bold ${grandTotalSales >= grandTotalSalesLastYear ? 'text-blue-600' : 'text-red-600'}`}>
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
            className={`min-h-[230px] text-center flex flex-col justify-between ${s.bgColor} ${s.borderColor} cursor-pointer`}
            onMouseEnter={(e) => handleMouseEnter({ type: 'site', key: s.key, name: s.name }, e)}
            onMouseLeave={handleMouseLeave}
          >
            <div>
              <CardHeader className="py-2 px-3"><CardTitle className="text-xs">{s.name}</CardTitle></CardHeader>
              <CardContent className="space-y-0.5 py-1 px-3">
                <div className="text-base font-bold">¥{formatNumber(currentSales)}</div>
                <div className="text-[11px] text-gray-500">{totals ? formatNumber(totals[s.key]?.count ?? 0) : "-"}個</div>
                {viewMode === 'month' && (
                  <>
                    <div className="text-[11px] text-amber-700">手数料: ¥{totals ? formatNumber(totals[s.key]?.ecFees ?? 0) : "-"}</div>
                    <div className="text-[11px] font-semibold text-orange-700">
                      EC控除: ¥{totals ? formatNumber(totals[s.key]?.ecDeductions ?? 0) : "-"}
                    </div>
                    <div className="text-[10px] font-semibold text-orange-700">
                      売上比 {totals ? formatPercent(totals[s.key]?.ecDeductions ?? 0, currentSales) : "-"}
                    </div>
                    <div className="text-[11px] text-red-600">広告: ¥{totals ? formatNumber(totals[s.key]?.adCost ?? 0) : "-"}</div>
                    <div className="text-[11px] font-bold text-green-600">利益: ¥{totals ? formatNumber(totals[s.key]?.finalProfit ?? 0) : "-"}</div>
                  </>
                )}
              </CardContent>
            </div>
            {lySales > 0 && (
              <div className="px-3 pb-2">
                <div className={`pt-1 mt-1 border-t ${s.borderColor} opacity-60`}>
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
        <CardHeader className="px-4 py-2">
          <CardTitle className="text-sm">シリーズ別 売上・経費サマリー</CardTitle>
          {viewMode === 'month' && <p className="text-[10px] text-slate-500">EC手数料・控除は各EC内のシリーズ売上比で按分しています</p>}
        </CardHeader>
        <CardContent className="relative grid grid-cols-2 gap-2 px-4 py-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
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
              {viewMode === 'month' && (
                <>
                  <p className="text-[11px] text-amber-700">手数料(按分): ¥{formatNumber(series.ecFees)}</p>
                  <p className="text-[11px] text-orange-700">EC控除(按分): ¥{formatNumber(series.ecDeductions)}</p>
                  <p className="text-[10px] font-semibold text-orange-700">EC控除率: {formatPercent(series.ecDeductions, series.sales)}</p>
                  <p className="text-xs text-red-600">広告: ¥{formatNumber(series.adCost)}</p>
                  <p className="text-xs font-bold text-green-600">利益: ¥{formatNumber(series.finalProfit)}</p>
                </>
              )}
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

function emptySiteTotal(): Totals[string] {
  return {
    count: 0,
    amount: 0,
    profit: 0,
    platformFees: 0,
    paymentFees: 0,
    ecFees: 0,
    ecDeductions: 0,
    promotions: 0,
    refundEtc: 0,
    adCost: 0,
    finalProfit: 0,
  };
}

function comparisonToTotals(summary: ComparisonSummary | null | undefined): Totals | null {
  if (!summary) return null;
  const result: Totals = {};
  const byChannel = new Map(summary.channels.map((row) => [row.channel, row]));
  SITES.forEach((site) => {
    const row = byChannel.get(site.key);
    result[site.key] = {
      count: row?.quantity ?? 0,
      amount: row?.sales ?? 0,
      profit: row?.productProfit ?? 0,
      platformFees: row?.platformFees ?? 0,
      paymentFees: row?.paymentFees ?? 0,
      ecFees: (row?.platformFees ?? 0) + (row?.paymentFees ?? 0),
      ecDeductions: row?.ecDeductions ?? 0,
      promotions: (row?.sellerDiscounts ?? 0) + (row?.sellerCoupons ?? 0) + (row?.sellerPoints ?? 0),
      refundEtc: (row?.refunds ?? 0) + (row?.shippingCosts ?? 0) + (row?.otherCosts ?? 0) - (row?.otherCredits ?? 0),
      adCost: row?.directAdCost ?? 0,
      finalProfit: row?.finalProfit ?? 0,
    };
  });
  return result;
}

function formatPercent(value: number, base: number) {
  return base > 0 ? `${(value / base * 100).toFixed(1)}%` : '—';
}
