// /components/food-store/CategoryRankingCard.tsx ver.2
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { TrendingUp } from "lucide-react"

interface CategoryData {
  category: string
  totalSales: number
  itemCount: number
  totalQuantity: number
}

interface CategoryRankingCardProps {
  data: CategoryData[]
}

export function CategoryRankingCard({ data }: CategoryRankingCardProps) {
  const topCategories = data.slice(0, 5)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          カテゴリー別売上ランキング
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {topCategories.map((category, index) => (
            <div key={category.category} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                  index === 0 ? 'bg-yellow-100 text-yellow-800' :
                  index === 1 ? 'bg-gray-100 text-gray-800' :
                  index === 2 ? 'bg-orange-100 text-orange-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {index + 1}
                </div>
                <div>
                  <div className="font-medium">{category.category}</div>
                  <div className="text-sm text-gray-500">{category.itemCount}商品</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{formatCurrency(category.totalSales)}</div>
                <div className="text-sm text-gray-500">{category.totalQuantity.toLocaleString()}個</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
