"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WebSalesCharts({ 
  month, 
  refreshTrigger 
}: { 
  month: string;
  refreshTrigger?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📊 総売上推移（過去6ヶ月）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center h-64 text-gray-500">
            グラフ準備中...
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📈 ECサイト別売上（過去6ヶ月）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center h-64 text-gray-500">
            グラフ準備中...
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
