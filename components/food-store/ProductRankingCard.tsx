// /components/food-store/ProductRankingCard.tsx ver.2
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

interface ProductRankingCardProps {
  rank: number
  product: {
    product_name: string
    total_sales: number
    quantity_sold: number
    category_name?: string // カテゴリー名を追加
  }
}

// カテゴリー別の色設定（CategoryRankingCardと同じ）
const getCategoryColor = (categoryName: string | undefined) => {
  if (!categoryName) return 'bg-white'
  
  switch (categoryName) {
    case '喜多方ラーメン':
      return 'bg-blue-50'
    case '西会津味噌ラーメン':
      return 'bg-orange-50'
    case '季節メニュー':
      return 'bg-green-50'
    case '会津ソースカツ丼':
      return 'bg-amber-50'
    case '山塩ラーメン':
      return 'bg-gray-50'
    case '会津カレー':
      return 'bg-yellow-50'
    case '単品':
      return 'bg-slate-50'
    default:
      return 'bg-white'
  }
}

export function ProductRankingCard({ rank, product }: ProductRankingCardProps) {
  const categoryColor = getCategoryColor(product.category_name)
  
  return (
    <Card className={`h-full p-2 ${categoryColor}`}>
      <div className="text-xs font-semibold text-gray-500 mb-1">#{rank}</div>
      <div className="text-xs font-medium line-clamp-2 mb-1">{product.product_name}</div>
      <div className="text-xs font-bold">{formatCurrency(product.total_sales)}</div>
    </Card>
  )
}
