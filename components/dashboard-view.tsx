// components/dashboard-view.tsx (認証解除テスト用)

"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart as ReBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { BarChart3, TrendingUp, Users, JapaneseYenIcon as Yen, Loader2 } from "lucide-react"
import { supabase } from "../lib/supabase" // 基本的なクライアントをインポート
import { formatDateJST } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import GenerateReportButton from './GenerateReportButton'

export default function DashboardView() {
  // ... (useStateの定義部分は変更ありません)
  const [monthlySales, setMonthlySales] = useState<number | null>(null)
  const [monthlyFloorSales, setMonthlyFloorSales] = useState<number | null>(null)
  const [monthlyEcTotal, setMonthlyEcTotal] = useState<number | null>(null)
  const [monthlyRegisterCount, setMonthlyRegisterCount] = useState<number | null>(null)
  const [registerCount, setRegisterCount] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [ecTotalAmount, setEcTotalAmount] = useState<number | null>(null)
  const [floorSales, setFloorSales] = useState<number | null>(null)
  const [floorSalesData, setFloorSalesData] = useState<{ date: string; floor_sales: number; }[]>([])
  const [ecSalesData, setEcSalesData] = useState<{ date: string; ec_sales: number; }[]>([])
  const [floorSalesYearData, setFloorSalesYearData] = useState<{ month: string; floor_sales: number; }[]>([])
  const [ecSalesYearData, setEcSalesYearData] = useState<{ month: string; ec_sales: number; }[]>([])
  const [aiReportLoading, setAiReportLoading] = useState<boolean>(false)
  const [latestAiReport, setLatestAiReport] = useState<string>("")
  const [aiLoading, setAiLoading] = useState<boolean>(true)


  // --- これ以降、全てのデータ取得処理を、認証なしのシンプルな形に戻します ---

  useEffect(() => {
    const fetchMonthlyData = async () => {
      const start = new Date(selectedDate);
      start.setDate(1);
      const { data, error } = await supabase
        .from("daily_sales_report")
        .select("date, floor_sales, register_count, amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount")
        .gte("date", formatDateJST(start))
        .lte("date", formatDateJST(selectedDate))
        .order("date", { ascending: true });

      if (error) { console.error("Error fetching monthly data", error); return; }
      
      const floor = (data || []).reduce((sum, row) => sum + (row.floor_sales || 0), 0);
      const register = (data || []).reduce((sum, row) => sum + (row.register_count || 0), 0);
      const ec = (data || []).reduce((sum, row) => sum + (row.amazon_amount || 0) + (row.rakuten_amount || 0) + (row.yahoo_amount || 0) + (row.mercari_amount || 0) + (row.base_amount || 0) + (row.qoo10_amount || 0), 0);
      setMonthlyFloorSales(floor);
      setMonthlyRegisterCount(register);
      setMonthlyEcTotal(ec);
      setMonthlySales(floor + ec);
      setFloorSalesData((data || []).map((row) => ({ date: new Date(row.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }), floor_sales: row.floor_sales || 0, })));
      setEcSalesData((data || []).map((row) => ({ date: new Date(row.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }), ec_sales: (row.amazon_amount || 0) + (row.rakuten_amount || 0) + (row.yahoo_amount || 0) + (row.mercari_amount || 0) + (row.base_amount || 0) + (row.qoo10_amount || 0), })));
    };
    fetchMonthlyData();
  }, [selectedDate]); // 依存配列からsessionを削除

  useEffect(() => {
    const fetchFloorAndRegister = async () => {
      const { data, error } = await supabase.from("daily_sales_report").select("floor_sales, register_count").eq("date", formatDateJST(selectedDate));
      if (error) { console.error("Error fetching floor sales/register count", error); return; }
      const totalFloor = (data || []).reduce((sum, row) => sum + (row.floor_sales || 0), 0);
      const totalRegister = (data || []).reduce((sum, row) => sum + (row.register_count || 0), 0);
      setFloorSales(totalFloor);
      setRegisterCount(totalRegister);
    };
    fetchFloorAndRegister();
  }, [selectedDate]);

  useEffect(() => {
    const fetchEcTotal = async () => {
      const { data, error } = await supabase.from("daily_sales_report").select("amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount").eq("date", formatDateJST(selectedDate));
      if (error) { console.error("Error fetching ec total amount", error); return; }
      const total = (data || []).reduce((sum, row) => sum + (row.amazon_amount || 0) + (row.rakuten_amount || 0) + (row.yahoo_amount || 0) + (row.mercari_amount || 0) + (row.base_amount || 0) + (row.qoo10_amount || 0), 0);
      setEcTotalAmount(total);
    };
    fetchEcTotal();
  }, [selectedDate]);

  useEffect(() => {
    const fetchYearlyData = async () => {
      const end = new Date(selectedDate);
      const start = new Date(end);
      start.setDate(1);
      start.setMonth(start.getMonth() - 11);
      const { data, error } = await supabase.from("daily_sales_report").select("date, floor_sales, amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount").gte("date", formatDateJST(start)).lte("date", formatDateJST(end)).order("date", { ascending: true });
      if (error) { console.error("Error fetching yearly data", error); return; }
      const floorMap = new Map<string, number>();
      const ecMap = new Map<string, number>();
      for (let i = 0; i < 12; i++) {
        const d = new Date(start);
        d.setMonth(start.getMonth() + i);
        const key = formatDateJST(d).slice(0, 7).replace("-", "/");
        floorMap.set(key, 0);
        ecMap.set(key, 0);
      }
      (data || []).forEach((row) => {
        const key = formatDateJST(new Date(row.date)).slice(0, 7).replace("-", "/");
        if (floorMap.has(key)) {
          floorMap.set(key, (floorMap.get(key) || 0) + (row.floor_sales || 0));
          ecMap.set(key, (ecMap.get(key) || 0) + (row.amazon_amount || 0) + (row.rakuten_amount || 0) + (row.yahoo_amount || 0) + (row.mercari_amount || 0) + (row.base_amount || 0) + (row.qoo10_amount || 0));
        }
      });
      setFloorSalesYearData(Array.from(floorMap.keys()).map((key) => ({ month: key, floor_sales: floorMap.get(key) || 0 })));
      setEcSalesYearData(Array.from(ecMap.keys()).map((key) => ({ month: key, ec_sales: ecMap.get(key) || 0 })));
    };
    fetchYearlyData();
  }, [selectedDate]);

  useEffect(() => {
    const fetchLatestAiReport = async () => {
      setAiLoading(true);
      try {
        const { data, error } = await supabase.from("ai_reports").select("*").order("created_at", { ascending: false }).limit(1);
        if (error) throw error;
        if (data && data.length > 0) {
          setLatestAiReport(data[0].content || "");
        }
      } catch (e) {
        console.error("Error fetching latest AI report:", e);
      } finally {
        setAiLoading(false);
      }
    };
    fetchLatestAiReport();
  }, []);

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "¥0";
    return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(amount);
  }
    
  const handleRunAiAnalysis = async () => { /* ... */ };

  return (
    // ... (JSX部分は変更ありません) ...
    <div>
        {/* ... */}
    </div>
  );
}
