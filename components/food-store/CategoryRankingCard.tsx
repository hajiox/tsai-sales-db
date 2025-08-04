// /components/food-store/CategoryRankingCard.tsx ver.3
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

// カテゴリー別の色設定
const getCategoryColor = (categoryName: string) => {
  switch (categoryName) {
    case '喜多方ラーメン':
      return 'bg-blue-50 border-blue-200'
    case '西会津味噌ラーメン': // 修正：正式名称に変更
      return 'bg-orange-50 border-orange-200'
    case '季節メニュー':
      return 'bg-green-50 border-green-200'
    case '会津ソースカツ丼': // 修正：正式名称に変更
      return 'bg-amber-50 border-amber-200'
    case '山塩ラーメン':
      return 'bg-gray-50 border-gray-200'
    case '会津カレー':
      return 'bg-yellow-50 border-yellow-200'
    case '単品':
      return 'bg-slate-50 border-slate-200'
    default:
      return 'bg-white border-gray-200'
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

  const categoryColor = getCategoryColor(category.category)

  return (
    <Card className={`h-full ${categoryColor} border`}>
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
