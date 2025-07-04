// /app/wholesale/dashboard/page.tsx ver.2 (Select不使用版)
"use client"

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Package, Users, TrendingUp, FileText, DollarSign } from 'lucide-react';

export default function WholesaleDashboard() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // 月選択肢の生成（過去12ヶ月）
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月`
    };
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">卸販売管理システム</h1>
              <p className="text-sm text-gray-600 mt-1">卸販売実績を確認・管理します。</p>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" className="gap-2">
                <Calendar className="w-4 h-4" />
                月別表示
              </Button>
              <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="p-6 space-y-6">
        {/* サマリーカード */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium text-blue-900 flex items-center gap-2">
                <Package className="w-4 h-4" />
                卸商品
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900">0 件</div>
              <div className="text-sm text-blue-700">¥0</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium text-green-900 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                OEM商品
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900">0 件</div>
              <div className="text-sm text-green-700">¥0</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium text-purple-900 flex items-center gap-2">
                <Users className="w-4 h-4" />
                取引先
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-900">0 社</div>
              <div className="text-sm text-purple-700">卸先・OEM発注者</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium text-orange-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                合計金額
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-900">¥0</div>
              <div className="text-sm text-orange-700">卸 + OEM</div>
            </CardContent>
          </Card>
        </div>

        {/* 日別実績テーブル */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              日別売上実績
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 font-medium text-gray-700">商品名</th>
                    <th className="text-center p-3 font-medium text-gray-700">卸価格</th>
                    <th className="text-center p-3 font-medium text-gray-700">合計数</th>
                    <th className="text-center p-3 font-medium text-gray-700">合計金額</th>
                    {/* 日付列（1日〜31日） */}
                    {Array.from({ length: 31 }, (_, i) => (
                      <th key={i + 1} className="text-center p-3 font-medium text-gray-700 min-w-[60px]">
                        {i + 1}日
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-center">
                    <td colSpan={35} className="py-8 text-gray-500">
                      データがありません
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* 操作ボタン */}
        <div className="flex gap-4 justify-center">
          <Button size="lg" className="gap-2">
            <Package className="w-4 h-4" />
            商品マスタ管理
          </Button>
          <Button size="lg" variant="outline" className="gap-2">
            <Users className="w-4 h-4" />
            取引先管理
          </Button>
          <Button size="lg" variant="outline" className="gap-2">
            <FileText className="w-4 h-4" />
            売上データ入力
          </Button>
        </div>
      </div>
    </div>
  );
}
