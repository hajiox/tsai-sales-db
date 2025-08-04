// /components/food-store/ProductRankingCard.tsx ver.1
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

interface ProductRankingCardProps {
  rank: number
  product: {
    product_name: string
    total_sales: number
    quantity_sold: number
  }
}

export function ProductRankingCard({ rank, product }: ProductRankingCardProps) {
  return (
    <Card className="h-full p-2">
      <div className="text-xs font-semibold text-gray-500 mb-1">#{rank}</div>
      <div className="text-xs font-medium line-clamp-2 mb-1">{product.product_name}</div>
      <div className="text-xs font-bold">{formatCurrency(product.total_sales)}</div>
    </Card>
  )
}
