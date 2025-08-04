// /components/food-store/CategoryRankingCard.tsx ver.1
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
  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1: return "bg-yellow-100 text-yellow-800"
      case 2: return "bg-gray-100 text-gray-800"
      case 3: return "bg-orange-100 text-orange-800"
      default: return "bg-blue-100 text-blue-800"
    }
  }

  return (
    <Card className="h-full">
      <CardContent className="p-4">
        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold mb-2 ${getRankColor(rank)}`}>
          {rank}
        </div>
        <h3 className="font-semibold text-base mb-2">{category.category}</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">売上</span>
            <span className="font-medium">{formatCurrency(category.total_sales)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">個数</span>
            <span className="font-medium">{category.quantity_sold.toLocaleString()}個</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">商品数</span>
            <span className="font-medium">{category.product_count}点</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
