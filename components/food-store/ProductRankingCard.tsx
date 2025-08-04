// /components/food-store/ProductRankingCard.tsx ver.2
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { Package } from "lucide-react"

interface ProductData {
  product_name: string
  total_sales: number
  quantity_sold: number
  jan_code?: number
}

interface ProductRankingCardProps {
  data: ProductData[]
}

export function ProductRankingCard({ data }: ProductRankingCardProps) {
  const topProducts = data.slice(0, 10)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          商品別売上ランキングTOP10
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topProducts.map((product, index) => (
            <div key={product.jan_code || index} className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                  index === 0 ? 'bg-yellow-100 text-yellow-800' :
                  index === 1 ? 'bg-gray-100 text-gray-800' :
                  index === 2 ? 'bg-orange-100 text-orange-800' :
                  'bg-blue-50 text-blue-600'
                }`}>
                  {index + 1}
                </div>
                <div className="truncate text-sm">{product.product_name}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-semibold text-sm">{formatCurrency(product.total_sales)}</div>
                <div className="text-xs text-gray-500">{product.quantity_sold.toLocaleString()}個</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
