"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

type ChartData = {
  month: string;
  total: number;
  amazon: number;
  rakuten: number;
  yahoo: number;
  mercari: number;
  base: number;
  qoo10: number;
};

export default function WebSalesCharts({ 
  month, 
  refreshTrigger 
}: { 
  month: string;
  refreshTrigger?: number;
}) {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChartData();
  }, [month, refreshTrigger]);

  const fetchChartData = async () => {
    setLoading(true);
    try {
      // 過去6ヶ月のデータを取得
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const targetDate = new Date(month + '-01');
        targetDate.setMonth(targetDate.getMonth() - i);
        const monthStr = targetDate.toISOString().slice(0, 7);
        months.push(monthStr);
      }

      const results: ChartData[] = [];

      for (const targetMonth of months) {
        const { data, error } = await supabase.rpc("web_sales_full_month", {
          target_month: targetMonth,
        });

        if (error) throw error;

        const rows = (data as any[]) ?? [];
        
        // 月別集計
        let monthTotal = {
          total: 0,
          amazon: 0,
          rakuten: 0,
          yahoo: 0,
          mercari: 0,
          base: 0,
          qoo10: 0,
        };

        rows.forEach((row: any) => {
          const amazon = row.amazon_count || 0;
          const rakuten = row.rakuten_count || 0;
          const yahoo = row.yahoo_count || 0;
          const mercari = row.mercari_count || 0;
          const base = row.base_count || 0;
          const qoo10 = row.qoo10_count || 0;

          monthTotal.amazon += amazon;
          monthTotal.rakuten += rakuten;
          monthTotal.yahoo += yahoo;
          monthTotal.mercari += mercari;
          monthTotal.base += base;
          monthTotal.qoo10 += qoo10;
        });

        monthTotal.total = monthTotal.amazon + monthTotal.rakuten + monthTotal.yahoo + 
                          monthTotal.mercari + monthTotal.base + monthTotal.qoo10;

        results.push({
          month: targetMonth,
          ...monthTotal
        });
      }

      setChartData(results);
    } catch (error) {
      console.error('チャートデータ取得エラー:', error);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return `${year}年${parseInt(month)}月`;
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📊 総売上推移（過去6ヶ月）</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center h-64">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📈 ECサイト別売上（過去6ヶ月）</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center h-64">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* 総売上推移（棒グラフ） */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📊 総売上推移（過去6ヶ月）</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11 }}
                tickFormatter={formatMonth}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip 
                formatter={(value: number) => [value.toLocaleString() + '件', '販売数']}
                labelFormatter={formatMonth}
                contentStyle={{ 
                  backgroundColor: '#f8fafc', 
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <Bar 
                dataKey="total" 
                fill="#3b82f6" 
                radius={[2, 2, 0, 0]}
                name="総販売数"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ECサイト別売上（折れ線グラフ） */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📈 ECサイト別売上（過去6ヶ月）</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11 }}
                tickFormatter={formatMonth}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip 
                formatter={(value: number, name: string) => [value.toLocaleString() + '件', name]}
                labelFormatter={formatMonth}
                contentStyle={{ 
                  backgroundColor: '#f8fafc', 
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <Line type="monotone" dataKey="amazon" stroke="#ff9500" strokeWidth={2} dot={{ r: 3 }} name="Amazon" />
              <Line type="monotone" dataKey="rakuten" stroke="#bf0000" strokeWidth={2} dot={{ r: 3 }} name="楽天" />
              <Line type="monotone" dataKey="yahoo" stroke="#ff0033" strokeWidth={2} dot={{ r: 3 }} name="Yahoo!" />
              <Line type="monotone" dataKey="mercari" stroke="#3498db" strokeWidth={2} dot={{ r: 3 }} name="メルカリ" />
              <Line type="monotone" dataKey="base" stroke="#00b894" strokeWidth={2} dot={{ r: 3 }} name="BASE" />
              <Line type="monotone" dataKey="qoo10" stroke="#fdcb6e" strokeWidth={2} dot={{ r: 3 }} name="Qoo10" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </Card>
    </div>
  );
}
