// /components/sales-top10-summary.tsx ver.2 (クライアントサイド専用に修正)

"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from "sonner";
import Link from "next/link";

interface TopRecord {
  report_date: string;
  value: number;
}

export default function SalesTop10Summary() {
  const [topSales, setTopSales] = useState<TopRecord[]>([]);
  const [topCounts, setTopCounts] = useState<TopRecord[]>([]);
  const [maxSales, setMaxSales] = useState<number>(0);
  const [maxCounts, setMaxCounts] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  const supabase = createClientComponentClient();

  // 日付フォーマット（YYYY-MM-DD → YYYY/M/D）
  const formatDate = (dateStr: string): string => {
    const [year, month, day] = dateStr.split("-");
    return `${year}/${parseInt(month, 10)}/${parseInt(day, 10)}`;
  };

  // 金額フォーマット
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('ja-JP');
  };

  // TOP10データを取得
  useEffect(() => {
    const fetchTopRecords = async () => {
      setIsLoading(true);
      
      try {
        // 売上TOP10を取得
        const { data: salesData, error: salesError } = await supabase.rpc('get_top_sales', { limit_count: 10 });
        
        if (salesError) throw salesError;
        
        // 件数TOP10を取得
        const { data: countsData, error: countsError } = await supabase.rpc('get_top_counts', { limit_count: 10 });
        
        if (countsError) throw countsError;

        // 最大値を取得
        const { data: maxData, error: maxError } = await supabase.rpc('get_max_sales_and_counts');
        
        if (maxError) throw maxError;

        setTopSales(salesData || []);
        setTopCounts(countsData || []);
        
        if (maxData && maxData.length > 0) {
          setMaxSales(maxData[0].max_sales || 0);
          setMaxCounts(maxData[0].max_counts || 0);
        }
      } catch (err: any) {
        console.error("TOP10データ取得エラー:", err);
        toast.error("TOP10データの取得に失敗しました");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTopRecords();
  }, [supabase]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold text-slate-800 mb-4">売上TOP10サマリー</h2>
      
      {isLoading ? (
        <p className="text-slate-500 text-center py-10">データを読み込んでいます...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 売上金額TOP10 */}
          <div>
            <h3 className="text-lg font-semibold text-slate-700 mb-3 pb-2 border-b-2 border-slate-200">
              💰 売上金額TOP10
            </h3>
            <div className="space-y-2">
              {topSales.map((record, index) => {
                const isNewRecord = index === 0 && record.value === maxSales;
                return (
                  <Link 
                    key={`sales-${index}`}
                    href={`/sales/daily?date=${record.report_date}`}
                    className="flex justify-between items-center p-2 hover:bg-slate-50 rounded transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-500 w-6">
                        {index + 1}
                      </span>
                      <span className="text-sm text-slate-600 group-hover:text-blue-600 group-hover:underline">
                        {formatDate(record.report_date)}
                      </span>
                      {isNewRecord && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">
                          🏆 NEW!
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-slate-800">
                      ¥{formatCurrency(record.value)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* 売上件数TOP10 */}
          <div>
            <h3 className="text-lg font-semibold text-slate-700 mb-3 pb-2 border-b-2 border-slate-200">
              📦 売上件数TOP10
            </h3>
            <div className="space-y-2">
              {topCounts.map((record, index) => {
                const isNewRecord = index === 0 && record.value === maxCounts;
                return (
                  <Link 
                    key={`counts-${index}`}
                    href={`/sales/daily?date=${record.report_date}`}
                    className="flex justify-between items-center p-2 hover:bg-slate-50 rounded transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-500 w-6">
                        {index + 1}
                      </span>
                      <span className="text-sm text-slate-600 group-hover:text-blue-600 group-hover:underline">
                        {formatDate(record.report_date)}
                      </span>
                      {isNewRecord && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">
                          🏆 NEW!
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-slate-800">
                      {formatCurrency(record.value)}件
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
