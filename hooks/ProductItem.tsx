// /components/ProductItem.tsx ver.1
interface DuplicateInfo {
  count: number
  amazonTitles: string[]
  totalQuantity: number
  originalQuantities: number[]
}

interface AllProductResult {
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matched: boolean
  matchType?: 'exact' | 'learned' | 'high' | 'medium' | 'low' | 'none'
  hasData: boolean
  isDuplicate?: boolean
  duplicateInfo?: DuplicateInfo
}

interface ProductItemProps {
  result: AllProductResult
  index: number
  productMaster: { id: string; name: string }[]
  onProductChange: (index: number, productId: string) => void
  onQuantityChange: (index: number, quantity: number) => void
  onRemove: (index: number) => void
}

export default function ProductItem({
  result,
  index,
  productMaster,
  onProductChange,
  onQuantityChange,
  onRemove
}: ProductItemProps) {
  const getBorderStyle = () => {
    if (result.isDuplicate) return 'bg-red-50 border-red-300'
    if (!result.hasData) return 'bg-gray-50 border-gray-200'
    if (result.matchType === 'exact' || result.matchType === 'learned') return 'bg-green-50 border-green-200'
    if (result.matchType === 'high') return 'bg-blue-50 border-blue-200'
    if (result.matchType === 'medium') return 'bg-yellow-50 border-yellow-200'
    return 'bg-orange-50 border-orange-200'
  }

  const getMatchTypeLabel = () => {
    if (result.isDuplicate) return `重複統合 (${result.duplicateInfo?.count}件)`
    if (!result.hasData) return 'データなし'
    if (result.matchType === 'exact') return '完全一致（要確認）'
    if (result.matchType === 'learned') return '学習済み（要確認）'
    if (result.matchType === 'high') return '高精度（要確認）'
    if (result.matchType === 'medium') return '中精度（要確認）'
    return '低精度（要確認）'
  }

  const getMatchTypeStyle = () => {
    if (result.isDuplicate) return 'bg-red-100 text-red-800'
    if (!result.hasData) return 'bg-gray-100 text-gray-600'
    if (result.matchType === 'exact' || result.matchType === 'learned') return 'bg-green-100 text-green-800'
    if (result.matchType === 'high') return 'bg-blue-100 text-blue-800'
    if (result.matchType === 'medium') return 'bg-yellow-100 text-yellow-800'
    return 'bg-orange-100 text-orange-800'
  }

  return (
    <div className={`border rounded-lg p-4 ${getBorderStyle()}`}>
      {/* 重複警告 */}
      {result.isDuplicate && result.duplicateInfo && (
        <div className="mb-4 p-2 bg-red-100 border border-red-200 rounded">
          <div className="text-xs text-red-700 font-semibold">🚨 重複検出</div>
          <div className="text-xs text-red-600 mt-1">
            {result.duplicateInfo.count}件のCSV商品が同じマスターに紐付き:
          </div>
          <div className="text-xs text-red-600 mt-1">
            数量: {result.duplicateInfo.originalQuantities.join(' + ')} = {result.duplicateInfo.totalQuantity}個
          </div>
        </div>
      )}

      {/* 商品名 */}
      <div className="mb-4">
        <label className="text-xs text-gray-500 font-medium">商品名</label>
        <p className="text-sm font-bold text-gray-800">{result.productName}</p>
      </div>

      {/* Amazon商品名 */}
      {result.hasData && (
        <div className="mb-4">
          <label className="text-xs text-gray-500 font-medium">Amazon商品名</label>
          <p className="text-sm font-medium text-gray-700">{result.amazonTitle}</p>
        </div>
      )}

      {/* 商品選択 */}
      <div className="mb-4">
        <label className="text-xs text-gray-500 font-medium block mb-1">
          商品選択（修正可能）
          {result.hasData && <span className="ml-2 text-xs text-blue-600">※要確認</span>}
        </label>
        <select
          value={result.productId}
          onChange={(e) => onProductChange(index, e.target.value)}
          className="w-full text-sm border rounded px-3 py-2"
          disabled={!result.hasData}
        >
          <option value="">商品を選択...</option>
          {productMaster.map((product) => (
            <option key={product.id} value={product.id}>{product.name}</option>
          ))}
        </select>
      </div>

      {/* 販売数・削除ボタン */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1">
          <label className="text-xs text-gray-500 font-medium block mb-1">
            販売数{result.isDuplicate ? '（統合済み）' : ''}
          </label>
          <input
            type="number"
            value={result.quantity}
            onChange={(e) => onQuantityChange(index, parseInt(e.target.value) || 0)}
            className="w-full text-sm border rounded px-3 py-2"
            min="0"
            disabled={!result.hasData}
          />
        </div>
        {result.hasData && (
          <div className="pt-6">
            <button
              onClick={() => onRemove(index)}
              className="text-red-500 hover:text-red-700 text-sm px-3 py-2 border border-red-200 rounded"
            >
              削除
            </button>
          </div>
        )}
      </div>

      {/* マッチタイプラベル */}
      <div>
        <div className={`text-xs px-3 py-1 rounded inline-block ${getMatchTypeStyle()}`}>
          {getMatchTypeLabel()}
        </div>
      </div>
    </div>
  )
}
