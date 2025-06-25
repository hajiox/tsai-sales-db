// /components/UnmatchedProductsView.tsx ver.16 – 依存ゼロ版
"use client"

import React, { useState } from "react"
import { CheckCircle2, AlertCircle } from "lucide-react"

// ----------------------------
// 型定義
// ----------------------------
interface UnmatchedProduct {
  amazonTitle: string
  quantity: number
  matched: false
}

interface ProductMasterItem {
  id: string
  name: string
}

interface UnmatchedProductsViewProps {
  unmatchedProducts: UnmatchedProduct[]
  productMaster: ProductMasterItem[]
  showUnmatched: boolean
  onLearnMapping?: (amazonTitle: string, productId: string) => void
}

// ----------------------------
// コンポーネント本体
// ----------------------------
const UnmatchedProductsView: React.FC<UnmatchedProductsViewProps> = ({
  unmatchedProducts,
  productMaster,
  showUnmatched,
  onLearnMapping,
}) => {
  // 行ごとの選択状態を保持（amazonTitle → productId）
  const [selectedMap, setSelectedMap] = useState<Record<string, string>>({})

  if (!showUnmatched) return null

  const handleSelect = (amazonTitle: string, productId: string) => {
    setSelectedMap((prev) => ({ ...prev, [amazonTitle]: productId }))
  }

  const handleLearn = (amazonTitle: string) => {
    const productId = selectedMap[amazonTitle]
    if (!productId) return
    onLearnMapping?.(amazonTitle, productId)
    // リセットして次の商品へ
    setSelectedMap((prev) => ({ ...prev, [amazonTitle]: "" }))
  }

  return (
    <div className="space-y-4">
      {unmatchedProducts.map((p) => {
        const selectedId = selectedMap[p.amazonTitle] ?? ""
        const isReady = selectedId !== ""
        const learned = false // TODO: サーバー反映済み判定が必要なら prop で渡す

        return (
          <div
            key={p.amazonTitle}
            className={`border rounded p-3 space-y-2 ${
              learned ? "bg-green-50" : "bg-orange-50"
            }`}
          >
            <div className="font-medium text-sm flex items-start gap-2">
              {learned ? (
                <CheckCircle2 className="text-green-600 shrink-0" size={18} />
              ) : (
                <AlertCircle className="text-orange-600 shrink-0" size={18} />
              )}
              <span>{p.amazonTitle}</span>
              <span className="ml-auto text-xs text-gray-500">{p.quantity}個</span>
            </div>

            {/* プルダウン */}
            <select
              value={selectedId}
              onChange={(e) => handleSelect(p.amazonTitle, e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="">商品を選択…</option>
              {productMaster.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>

            {/* 学習ボタン or 警告 */}
            {onLearnMapping ? (
              <button
                onClick={() => handleLearn(p.amazonTitle)}
                disabled={!isReady}
                className={`mt-1 text-sm font-semibold px-3 py-1.5 rounded ${
                  isReady
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              >
                このマッピングを学習する
              </button>
            ) : (
              <p className="mt-1 flex items-center gap-1 text-red-600 text-xs">
                <AlertCircle size={14} /> 親から <code>onLearnMapping</code> が渡されていません
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default UnmatchedProductsView;
