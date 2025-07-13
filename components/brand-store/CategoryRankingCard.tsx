// /app/components/brand-store/CategoryRankingCard.tsx ver.1
"use client"

import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

interface CategoryRankingCardProps {
  rank: number
  category: {
    category: string
    total_sales: number
    quantity_sold: number
    product_count: number
  }
}

export function CategoryRankingCard({ rank, category }: CategoryRankingCardProps) {
  // ランクに応じた背景色
  const rankColors = {
    1: "bg-yellow-50 border-yellow-300",
    2: "bg-gray-50 border-gray-300",
    3: "bg-orange-50 border-orange-300",
    4: "bg-blue-50 border-blue-200",
    5: "bg-green-50 border-green-200"
  }

  const bgColor = rankColors[rank as keyof typeof rankColors] || "bg-gray-50"

  return (
    <Card className={`${bgColor} border-2`}>
      <CardContent className="p-4">
        <div className="text-center">
          <div className="text-2xl font-bold mb-2">{rank}位</div>
          <div className="text-sm font-medium mb-2 truncate" title={category.category}>
            {category.category}
          </div>
          <div className="text-lg font-semibold">
            {formatCurrency(category.total_sales)}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {category.quantity_sold.toLocaleString()}個
          </div>
          <div className="text-xs text-gray-500">
            ({category.product_count}商品)
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
