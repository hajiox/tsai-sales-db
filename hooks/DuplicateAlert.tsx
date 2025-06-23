// /components/DuplicateAlert.tsx ver.1
interface DuplicateInfo {
  count: number
  amazonTitles: string[]
  totalQuantity: number
  originalQuantities: number[]
}

interface AllProductResult {
  productId: string
  productName: string
  isDuplicate?: boolean
  duplicateInfo?: DuplicateInfo
}

interface DuplicateAlertProps {
  duplicates: AllProductResult[]
}

export default function DuplicateAlert({ duplicates }: DuplicateAlertProps) {
  if (duplicates.length === 0) return null

  return (
    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
      <h4 className="text-red-800 font-semibold mb-2">⚠️ 重複検出！</h4>
      <p className="text-sm text-red-700 mb-2">
        <strong>{duplicates.length}商品</strong>で重複が検出されました。同じ商品マスターに複数のCSV商品が紐付いています。
      </p>
      <div className="text-xs text-red-600">
        数量は自動で合計されますが、確認してください。
      </div>
    </div>
  )
}
