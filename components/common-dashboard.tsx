"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const dummy = [
  { site: "Amazon", count: 120, amount: 100000 },
  { site: "BASE", count: 80, amount: 50000 },
  { site: "Yahoo", count: 40, amount: 30000 },
  { site: "楽天", count: 70, amount: 60000 },
]

export default function CommonDashboard() {
  const f = (n: number) => new Intl.NumberFormat("ja-JP").format(n)
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {dummy.map((d) => (
        <Card key={d.site}>
          <CardHeader>
            <CardTitle className="text-sm">{d.site}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-xl font-bold">{f(d.count)} 件</div>
            <div className="text-sm text-gray-500">¥{f(d.amount)}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
