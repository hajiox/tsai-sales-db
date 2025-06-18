"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { useEffect, useState } from 'react';

interface MonthlyData {
  month: string;
  total: number;
  amazon: number;
  rakuten: number;
  yahoo: number;
  mercari: number;
  base: number;
  qoo10: number;
}

export default function WebSalesCharts({ 
  month, 
  refreshTrigger 
}: { 
  month: string;
  refreshTrigger?: number;
}) {
  const [chartData, setChartData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChartData();
  }, [month, refreshTrigger]);

  const fetchChartData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/web-sales-chart-data');
      if (response.ok) {
        const data = await response.json();
        setChartData(data);
      }
    } catch (error) {
      console.error('Chart data fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">📊 総売上推移（過去6ヶ月）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center">
              <div className="text-gray-500">データ読み込み中...</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">📈 ECサイト別売上（過去6ヶ月）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center">
              <div className="text-gray-500">データ読み込み中...</div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📊 総売上推移（過去6ヶ月）</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📈 ECサイト別売上（過去6ヶ月）</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="amazon" stroke="#ff9500" name="Amazon" />
              <Line type="monotone" dataKey="rakuten" stroke="#bf0000" name="楽天" />
              <Line type="monotone" dataKey="yahoo" stroke="#ff0033" name="Yahoo!" />
              <Line type="monotone" dataKey="mercari" stroke="#3498db" name="メルカリ" />
              <Line type="monotone" dataKey="base" stroke="#00b894" name="BASE" />
              <Line type="monotone" dataKey="qoo10" stroke="#fdcb6e" name="Qoo10" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
