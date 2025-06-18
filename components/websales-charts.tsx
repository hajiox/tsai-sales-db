"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WebSalesCharts({ 
  month, 
  refreshTrigger 
}: { 
  month: string;
  refreshTrigger?: number;
}) {
  const dummyData = [
    { month: "11月", total: 2500 },
    { month: "12月", total: 3200 },
    { month: "1月", total: 2800 },
    { month: "2月", total: 3500 },
    { month: "3月", total: 4100 },
    { month: "4月", total: 5400 }
  ];

  const sites = [
    { name: "Amazon", value: 2465, color: "#ff9500" },
    { name: "楽天", value: 1200, color: "#bf0000" },
    { name: "Yahoo!", value: 800, color: "#ff0033" },
    { name: "メルカリ", value: 600, color: "#3498db" },
    { name: "BASE", value: 200, color: "#00b894" },
    { name: "Qoo10", value: 139, color: "#fdcb6e" }
  ];

  return (
    <div className="grid grid-cols-2 gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📊 総売上推移（過去6ヶ月）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {dummyData.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{item.month}</span>
                <div className="flex items-center space-x-2">
                  <div 
                    className="bg-blue-500 h-4 rounded" 
                    style={{ width: `${(item.total / 6000) * 100}px` }}
                  ></div>
                  <span className="text-sm font-medium">{item.total.toLocaleString()}件</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📈 ECサイト別売上（過去6ヶ月）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sites.map((site, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: site.color }}
                  ></div>
                  <span className="text-sm text-gray-600">{site.name}</span>
                </div>
                <span className="text-sm font-medium">{site.value.toLocaleString()}件</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
