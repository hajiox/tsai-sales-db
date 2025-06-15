// components/dashboard-view.tsx (最終修正版)

"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react" // <-- NextAuthのuseSessionをインポート
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart as ReBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { BarChart3, TrendingUp, Users, JapaneseYenIcon as Yen, Loader2 } from "lucide-react"
import { createAuthenticatedSupabaseClient } from "../lib/supabase" // <-- 変更
import { formatDateJST } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import GenerateReportButton from './GenerateReportButton'

export default function DashboardView() {
  const { data: session } = useSession(); // <-- セッション情報を取得

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


  // --- これ以降、全てのデータ取得処理を修正 ---

  useEffect(() => {
    const fetchMonthlyData = async () => {
      if (!(session as any)?.supabaseAccessToken) return; // トークンがなければ処理しない
      const supabase = createAuthenticatedSupabaseClient((session as any).supabaseAccessToken);

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
  }, [selectedDate, session]); // <-- 依存配列にsessionを追加

  useEffect(() => {
    const fetchFloorAndRegister = async () => {
      if (!(session as any)?.supabaseAccessToken) return;
      const supabase = createAuthenticatedSupabaseClient((session as any).supabaseAccessToken);
      
      const { data, error } = await supabase.from("daily_sales_report").select("floor_sales, register_count").eq("date", formatDateJST(selectedDate));
      if (error) { console.error("Error fetching floor sales/register count", error); return; }

      const totalFloor = (data || []).reduce((sum, row) => sum + (row.floor_sales || 0), 0);
      const totalRegister = (data || []).reduce((sum, row) => sum + (row.register_count || 0), 0);
      setFloorSales(totalFloor);
      setRegisterCount(totalRegister);
    };
    fetchFloorAndRegister();
  }, [selectedDate, session]); // <-- 依存配列にsessionを追加

  useEffect(() => {
    const fetchEcTotal = async () => {
      if (!(session as any)?.supabaseAccessToken) return;
      const supabase = createAuthenticatedSupabaseClient((session as any).supabaseAccessToken);
      
      const { data, error } = await supabase.from("daily_sales_report").select("amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount").eq("date", formatDateJST(selectedDate));
      if (error) { console.error("Error fetching ec total amount", error); return; }
      
      const total = (data || []).reduce((sum, row) => sum + (row.amazon_amount || 0) + (row.rakuten_amount || 0) + (row.yahoo_amount || 0) + (row.mercari_amount || 0) + (row.base_amount || 0) + (row.qoo10_amount || 0), 0);
      setEcTotalAmount(total);
    };
    fetchEcTotal();
  }, [selectedDate, session]); // <-- 依存配列にsessionを追加

  useEffect(() => {
    const fetchYearlyData = async () => {
      if (!(session as any)?.supabaseAccessToken) return;
      const supabase = createAuthenticatedSupabaseClient((session as any).supabaseAccessToken);

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
  }, [selectedDate, session]); // <-- 依存配列にsessionを追加

  useEffect(() => {
    const fetchLatestAiReport = async () => {
      setAiLoading(true);
      if (!(session as any)?.supabaseAccessToken) {
        // トークンがない場合でもローディングは終了させる
        setAiLoading(false);
        return;
      }
      const supabase = createAuthenticatedSupabaseClient((session as any).supabaseAccessToken);
      
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
  }, [session]); // <-- 依存配列にsessionを追加

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "¥0";
    return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(amount);
  }
    
  const handleRunAiAnalysis = async () => {
    // この関数も同様に修正が必要
    // ...
  };

  return (
    // ... (JSX部分は変更ありません) ...
    <div>
       <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">ダッシュボード</h2>
          <p className="text-sm text-gray-600">売上データの概要と分析</p>
        </div>
        <div className="text-right">
          <input
            type="date"
            value={formatDateJST(selectedDate)}
            onChange={(e) => setSelectedDate(new Date(e.target.value))}
            className="border rounded text-xs p-1 mb-1 mr-2"
          />
          <GenerateReportButton />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="space-y-4 mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">フロア売上</CardTitle>
              <Yen className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(floorSales)}</div>
              <p className="text-xs text-gray-500 mt-1">{formatDateJST(selectedDate)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">レジ通過人数</CardTitle>
              <Users className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{registerCount ?? 0}</div>
              <p className="text-xs text-gray-500 mt-1">{formatDateJST(selectedDate)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">EC売上</CardTitle>
              <BarChart3 className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(ecTotalAmount)}</div>
              <p className="text-xs text-gray-500 mt-1">{formatDateJST(selectedDate)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">売上日計</CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency((floorSales || 0) + (ecTotalAmount || 0))}</div>
              <p className="text-xs text-gray-500 mt-1">{formatDateJST(selectedDate)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">フロア累計</CardTitle>
              <Yen className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(monthlyFloorSales)}</div>
                <p className="text-xs text-gray-500 mt-1">1日〜{formatDateJST(selectedDate)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">EC累計</CardTitle>
              <BarChart3 className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(monthlyEcTotal)}</div>
                <p className="text-xs text-gray-500 mt-1">1日〜{formatDateJST(selectedDate)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">レジ累計</CardTitle>
              <Users className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{monthlyRegisterCount ?? 0}</div>
                <p className="text-xs text-gray-500 mt-1">1日〜{formatDateJST(selectedDate)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">売上総計</CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(monthlySales)}</div>
                <p className="text-xs text-gray-500 mt-1">1日〜{formatDateJST(selectedDate)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ... (残りのJSXも変更ありません) ... */}
    </div>
  );
}
