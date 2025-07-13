// /app/components/brand-store/TotalSalesCard.tsx ver.1
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { TrendingUp, Package, ShoppingCart, Percent, RotateCcw, Store } from "lucide-react"

interface TotalSalesCardProps {
  data: {
    totalSales: number
    totalQuantity: number
    totalGrossProfit: number
    avgGrossProfitRatio: number
    totalReturns: number
    totalProducts: number
  } | null
}

export function TotalSalesCard({ data }: TotalSalesCardProps) {
  const cards = [
    {
      title: "総売上",
      value: data ? formatCurrency(data.totalSales) : "¥0",
      icon: TrendingUp,
      color: "text-blue-600"
    },
    {
      title: "総販売数",
      value: data ? data.totalQuantity.toLocaleString() + "個" : "0個",
      icon: Package,
      color: "text-green-600"
    },
    {
      title: "総粗利",
      value: data ? formatCurrency(data.totalGrossProfit) : "¥0",
      icon: ShoppingCart,
      color: "text-purple-600"
    },
    {
      title: "平均粗利率",
      value: data ? data.avgGrossProfitRatio.toFixed(1) + "%" : "0.0%",
      icon: Percent,
      color: "text-orange-600"
    },
    {
      title: "総返品数",
      value: data ? data.totalReturns.toLocaleString() + "個" : "0個",
      icon: RotateCcw,
      color: "text-red-600"
    },
    {
      title: "取扱商品数",
      value: data ? data.totalProducts.toLocaleString() + "点" : "0点",
      icon: Store,
      color: "text-indigo-600"
    }
  ]

  return (
    <div className="grid grid-cols-6 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon
        return (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <Icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
