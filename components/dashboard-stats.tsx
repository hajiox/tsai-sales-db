// components/dashboard-stats.tsx
"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { nf } from "@/lib/utils";

interface Props {
  data: any;
  monthlyData: any;
  isLoading: boolean;
}

export default function DashboardStats({ data, monthlyData, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
        {[...Array(9)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400">読み込み中...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-6 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // 日別データの場合の表示
  const dailyStats = [
    { title: "フロア日計", value: data?.floor_sales || 0, unit: "円" },
    { title: "レジ通過", value: data?.register_count || 0, unit: "人" },
    { title: "Amazon", value: data?.amazon_amount || 0, unit: "円" },
    { title: "楽天", value: data?.rakuten_amount || 0, unit: "円" },
    { title: "Yahoo!", value: data?.yahoo_amount || 0, unit: "円" },
    { title: "メルカリ", value: data?.mercari_amount || 0, unit: "円" },
    { title: "BASE", value: data?.base_amount || 0, unit: "円" },
    { title: "Qoo10", value: data?.qoo10_amount || 0, unit: "円" },
    { 
      title: "日計合計", 
      value: (data?.floor_sales || 0) + 
             (data?.amazon_amount || 0) + 
             (data?.rakuten_amount || 0) + 
             (data?.yahoo_amount || 0) + 
             (data?.mercari_amount || 0) + 
             (data?.base_amount || 0) + 
             (data?.qoo10_amount || 0), 
      unit: "円" 
    }
  ];

  // 月累計データの表示
  const monthlyStats = [
    { title: "フロア累計", value: monthlyData?.m_floor_total || 0, unit: "円" },
    { title: "レジ通過累計", value: monthlyData?.m_register_count_total || 0, unit: "人" },
    { title: "Amazon累計", value: monthlyData?.m_amazon_total || 0, unit: "円" },
    { title: "楽天累計", value: monthlyData?.m_rakuten_total || 0, unit: "円" },
    { title: "Yahoo!累計", value: monthlyData?.m_yahoo_total || 0, unit: "円" },
    { title: "メルカリ累計", value: monthlyData?.m_mercari_total || 0, unit: "円" },
    { title: "BASE累計", value: monthlyData?.m_base_total || 0, unit: "円" },
    { title: "Qoo10累計", value: monthlyData?.m_qoo10_total || 0, unit: "円" },
    { title: "総合計", value: monthlyData?.m_grand_total || 0, unit: "円" }
  ];

  return (
    <div>
      {/* 日計サマリー */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">日計サマリー</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
          {dailyStats.map((stat, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">{stat.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold text-slate-800">
                  {nf(stat.value)} {stat.unit}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 月累計サマリー */}
      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">月累計サマリー</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
          {monthlyStats.map((stat, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">{stat.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold text-slate-800">
                  {nf(stat.value)} {stat.unit}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
