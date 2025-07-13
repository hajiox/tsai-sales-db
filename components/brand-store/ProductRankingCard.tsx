// /app/components/brand-store/ProductRankingCard.tsx ver.1
"use client"

import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

interface ProductRankingCardProps {
  rank: number
  product: {
    product_name: string
    category: string
    total_sales: number
    quantity_sold: number
  }
}

export function ProductRankingCard({ rank, product }: ProductRankingCardProps) {
  // ランクに応じた背景色（1-3位は特別な色）
  const getBgColor = () => {
    if (rank === 1) return "bg-yellow-50 border-yellow-300"
    if (rank === 2) return "bg-gray-50 border-gray-300"
    if (rank === 3) return "bg-orange-50 border-orange-300"
    return "bg-white border-gray-200"
  }

  return (
    <Card className={`${getBgColor()} border-2`}>
      <CardContent className="p-4">
        <div className="text-center">
          <div className="text-xl font-bold mb-2">{rank}位</div>
          <div className="text-sm font-medium mb-1 line-clamp-2 min-h-[2.5rem]" title={product.product_name}>
            {product.product_name}
          </div>
          <div className="text-xs text-gray-600 mb-2 truncate" title={product.category}>
            {product.category || "未設定"}
          </div>
          <div className="text-lg font-semibold">
            {formatCurrency(product.total_sales)}
          </div>
          <div className="text-xs text-gray-600">
            {product.quantity_sold.toLocaleString()}個
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
