// components/dashboard-view.tsx
"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { formatDateJST } from "@/lib/utils";
import DashboardHeader from "./dashboard-header";
import DashboardStats from "./dashboard-stats";
import SalesChartGrid from "./sales-chart-grid";
import DailySalesCrudForm from "./daily-sales-crud-form";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DashboardView() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [salesData, setSalesData] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<any[]>([]);
  const [todayData, setTodayData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // データ取得関数
  const fetchData = async (date: Date) => {
    setLoading(true);
    try {
      const formattedDate = formatDateJST(date);
      
      // 6ヶ月サマリー取得
      const { data: summary } = await supabase.rpc("get_6month_sales_summary", {
        end_date: formattedDate,
      });
      
      // 当日データ取得
      const { data: today } = await supabase
        .from("daily_sales_report")
        .select("*")
        .eq("date", formattedDate)
        .single();

      setSummaryData(summary || []);
      setTodayData(today);
      setSalesData(summary || []);
    } catch (error) {
      console.error("データ取得エラー:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate]);

  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
  };

  const handleDataUpdate = () => {
    fetchData(selectedDate);
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="container mx-auto px-4 py-6">
        <DashboardHeader
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
        />
        
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* サマリーカード - 3列全体 */}
          <div className="lg:col-span-3">
            <DashboardStats summaryData={summaryData} loading={loading} />
          </div>
          
          {/* グラフエリア - 2列 */}
          <div className="lg:col-span-2">
            <SalesChartGrid salesData={salesData} loading={loading} />
          </div>
          
          {/* 売上入力フォーム - 1列 */}
          <div className="lg:col-span-1">
            <DailySalesCrudForm
              selectedDate={selectedDate}
              initialData={todayData}
              onDataUpdate={handleDataUpdate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
