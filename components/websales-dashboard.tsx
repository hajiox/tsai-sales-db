"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"
import WebSalesSiteTrend from "./websales-site-trend"

const productData = [
  { month: "1月", sales: 30 },
  { month: "2月", sales: 45 },
  { month: "3月", sales: 40 },
  { month: "4月", sales: 50 },
  { month: "5月", sales: 55 },
  { month: "6月", sales: 60 },
]


const compareData = [
  { month: "1月", current: 30, lastYear: 25 },
  { month: "2月", current: 45, lastYear: 40 },
  { month: "3月", current: 40, lastYear: 38 },
  { month: "4月", current: 50, lastYear: 45 },
  { month: "5月", current: 55, lastYear: 50 },
  { month: "6月", current: 60, lastYear: 55 },
]

export default function WebSalesDashboard({ month }: { month: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>商品別売上推移</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productData}>
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="sales" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <WebSalesSiteTrend />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>前年同月との比較（個数）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareData}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="current" fill="#3b82f6" />
                <Bar dataKey="lastYear" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
