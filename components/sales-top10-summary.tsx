// /components/sales-top10-summary.tsx ver.5 (直接クエリテスト版)

"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

interface RawTopRecord {
  report_date: string | null;
  value: number | string | null;
}

export default function SalesTop10Summary() {
  const [topSales, setTopSales] = useState<RawTopRecord[]>([]);
  const [topCounts, setTopCounts] = useState<RawTopRecord[]>([]);
  const [maxSales, setMaxSales] = useState<number>(0);
  const [maxCounts, setMaxCounts] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toNumber = (value: number | string | null | undefined): number => {
    if (value === null || value === undefined) {
      return 0;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  // 日付フォーマット（YYYY-MM-DD → YYYY/M/D）
  const formatDate = (input: string | null): string => {
    if (!input) return "日付不明";

    const datePart = typeof input === "string" ? input : String(input);
    const [year, month = "", day = ""] = datePart.split("T")[0].split("-");

    if (!year || !month || !day) {
      return datePart.replace(/-/g, "/");
    }

    return `${year}/${parseInt(month, 10)}/${parseInt(day, 10)}`;
  };

  // 金額フォーマット
  const formatCurrency = (value: number | string | null): string => {
    return toNumber(value).toLocaleString("ja-JP");
  };

  // TOP10データを取得
  useEffect(() => {
    const fetchTopRecords = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      
      try {
        const supabase = getSupabaseBrowserClient();
        
        console.log('🔍 Fetching TOP10 data with RPC...');
        
        // RPC呼び出しを試す
        const { data: rpcTest, error: rpcError } = await supabase.rpc('get_top_sales', { limit_count: 10 });
        
        console.log('🧪 RPC Test Result:', { rpcTest, rpcError });
        
        if (rpcError) {
          console.error('❌ RPC Error:', rpcError);
          throw new Error(`RPC呼び出しエラー: ${rpcError.message}`);
        }
        
        if (!rpcTest || rpcTest.length === 0) {
          console.warn('⚠️ RPC returned empty array, trying direct query...');
          
          // 直接クエリで取得（フォールバック）
          const { data: directData, error: directError } = await supabase
            .from('daily_sales_report')
            .select('date')
            .not('date', 'is', null)
            .limit(10);
          
          console.log('📋 Direct Query Test:', { directData, directError });
          
          if (directError) {
            throw new Error(`直接クエリエラー: ${directError.message}`);
          }
          
          // ダミーデータで表示テスト
          setTopSales([
            { report_date: '2025-11-08', value: 456 },
            { report_date: '2025-11-09', value: 331 },
          ]);
          setTopCounts([
            { report_date: '2025-11-08', value: 456 },
            { report_date: '2025-11-09', value: 331 },
          ]);
          setMaxSales(456);
          setMaxCounts(456);
          
          return;
        }
        
        // 正常にRPCからデータ取得
        const { data: countsData, error: countsError } = await supabase.rpc('get_top_counts', { limit_count: 10 });
        
        if (countsError) throw countsError;

        const { data: maxData, error: maxError } = await supabase.rpc('get_max_sales_and_counts');
        
        if (maxError) throw maxError;

        console.log('✅ All data fetched successfully:', {
          salesCount: rpcTest.length,
          countsCount: (countsData || []).length,
          maxData
        });

        setTopSales(rpcTest || []);
        setTopCounts(countsData || []);

        if (maxData && maxData.length > 0) {
          setMaxSales(toNumber(maxData[0].max_sales));
          setMaxCounts(toNumber(maxData[0].max_counts));
        }
      } catch (err: any) {
        console.error("❌ TOP10データ取得エラー:", err);
        setErrorMessage(`エラー: ${err.message}`);
        toast.error("TOP10データの取得に失敗しました");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTopRecords();
  }, []);

  console.log('🎨 Rendering with:', {
    isLoading,
    errorMessage,
    topSalesLength: topSales.length,
    topCountsLength: topCounts.length
  });

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold text-slate-800 mb-4">売上TOP10サマリー</h2>
      
      {isLoading ? (
        <p className="text-slate-500 text-center py-10">データを読み込んでいます...</p>
      ) : errorMessage ? (
        <p className="text-red-500 text-center py-10">{errorMessage}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 売上金額TOP10 */}
          <div>
            <h3 className="text-lg font-semibold text-slate-700 mb-3 pb-2 border-b-2 border-slate-200">
              💰 売上金額TOP10
            </h3>
            <div className="space-y-2">
              {topSales.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">表示できるデータがありません。</p>
              ) : (
                topSales.map((record, index) => {
                  const recordValue = toNumber(record.value);
                  const isNewRecord = index === 0 && recordValue === maxSales;
                  const hasValidDate = Boolean(record.report_date);
                  const linkHref = hasValidDate ? `/sales/daily?date=${record.report_date}` : "#";

                  return (
                    <Link
                      key={`sales-${index}-${record.report_date ?? "unknown"}`}
                      href={linkHref}
                      className={`flex justify-between items-center p-2 rounded transition-colors group ${hasValidDate ? "hover:bg-slate-50" : "opacity-70 cursor-not-allowed"}`}
                      prefetch={false}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-500 w-6">
                          {index + 1}
                        </span>
                        <span className={`text-sm ${hasValidDate ? "text-slate-600 group-hover:text-blue-600 group-hover:underline" : "text-slate-400"}`}>
                          {formatDate(record.report_date)}
                        </span>
                        {isNewRecord && (
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">
                            🏆 NEW!
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-slate-800">
                        ¥{formatCurrency(recordValue)}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* 売上件数TOP10 */}
          <div>
            <h3 className="text-lg font-semibold text-slate-700 mb-3 pb-2 border-b-2 border-slate-200">
              📦 売上件数TOP10
            </h3>
            <div className="space-y-2">
              {topCounts.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">表示できるデータがありません。</p>
              ) : (
                topCounts.map((record, index) => {
                  const recordValue = toNumber(record.value);
                  const isNewRecord = index === 0 && recordValue === maxCounts;
                  const hasValidDate = Boolean(record.report_date);
                  const linkHref = hasValidDate ? `/sales/daily?date=${record.report_date}` : "#";

                  return (
                    <Link
                      key={`counts-${index}-${record.report_date ?? "unknown"}`}
                      href={linkHref}
                      className={`flex justify-between items-center p-2 rounded transition-colors group ${hasValidDate ? "hover:bg-slate-50" : "opacity-70 cursor-not-allowed"}`}
                      prefetch={false}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-500 w-6">
                          {index + 1}
                        </span>
                        <span className={`text-sm ${hasValidDate ? "text-slate-600 group-hover:text-blue-600 group-hover:underline" : "text-slate-400"}`}>
                          {formatDate(record.report_date)}
                        </span>
                        {isNewRecord && (
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">
                            🏆 NEW!
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-slate-800">
                        {formatCurrency(recordValue)}件
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
