"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  Legend,
} from "recharts"

const productData = [
  { month: "1月", sales: 30 },
  { month: "2月", sales: 45 },
  { month: "3月", sales: 40 },
  { month: "4月", sales: 50 },
  { month: "5月", sales: 55 },
  { month: "6月", sales: 60 },
]

const siteData = [
  { month: "1月", Amazon: 10, BASE: 5, Yahoo: 8, 楽天: 12 },
  { month: "2月", Amazon: 12, BASE: 7, Yahoo: 9, 楽天: 15 },
  { month: "3月", Amazon: 15, BASE: 8, Yahoo: 7, 楽天: 10 },
  { month: "4月", Amazon: 14, BASE: 9, Yahoo: 10, 楽天: 12 },
  { month: "5月", Amazon: 16, BASE: 10, Yahoo: 11, 楽天: 18 },
  { month: "6月", Amazon: 18, BASE: 12, Yahoo: 9, 楽天: 20 },
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
        <Card>
          <CardHeader>
            <CardTitle>サイト別売上推移</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={siteData}>
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Amazon" stroke="#3b82f6" />
                  <Line type="monotone" dataKey="BASE" stroke="#10b981" />
                  <Line type="monotone" dataKey="Yahoo" stroke="#f43f5e" />
                  <Line type="monotone" dataKey="楽天" stroke="#f59e0b" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
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
