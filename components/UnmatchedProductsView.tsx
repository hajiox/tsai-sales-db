// /components/UnmatchedProductsView.tsx ver.15 – 完全版
"use client"

import React, { useState } from "react"
import { AlertCircle, CheckCircle2, Plus } from "lucide-react"

// shadcn/ui
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

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
  /** 未マッチ Amazon 商品一覧 */
  unmatchedProducts: UnmatchedProduct[]
  /** 自社商品マスター */
  productMaster: ProductMasterItem[]
  /** true のとき一覧を表示（デフォルト true） */
  showUnmatched?: boolean
  /** 学習ボタン押下時に呼び出すコールバック */
  onLearnMapping?: (amazonTitle: string, productId: string) => void
}

// ----------------------------
// 本体コンポーネント
// ----------------------------
export default function UnmatchedProductsView({
  unmatchedProducts,
  productMaster,
  showUnmatched = true,
  onLearnMapping,
}: UnmatchedProductsViewProps) {
  // 商品ごとの選択状態を index → productId で管理
  const [selection, setSelection] = useState<Record<number, string | "">>({})

  // 非表示指定 or 該当なしなら何も出さない
  if (!showUnmatched || unmatchedProducts.length === 0) return null

  return (
    <div className="space-y-4">
      {unmatchedProducts.map((item, idx) => {
        const selectedId = selection[idx] ?? ""
        const readyToLearn = selectedId !== ""

        return (
          <div
            key={idx}
            className="rounded-md border p-4 space-y-3 bg-background/40"
          >
            {/* ① ヘッダー部分 */}
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div className="flex-1 space-y-1">
                <p className="font-medium leading-snug">{item.amazonTitle}</p>
                <p className="text-xs text-muted-foreground">数量: {item.quantity}</p>
              </div>
            </div>

            {/* ② マッピング UI */}
            <div className="flex items-center gap-4">
              {/* プルダウン */}
              <Select
                value={selectedId}
                onValueChange={(value) =>
                  setSelection((prev) => ({ ...prev, [idx]: value }))
                }
              >
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="対応する自社商品を選択…" />
                </SelectTrigger>
                <SelectContent>
                  {productMaster.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 学習ボタン / 警告 */}
              {onLearnMapping ? (
                <Button
                  size="sm"
                  className="gap-1"
                  variant="default"
                  disabled={!readyToLearn}
                  onClick={() => {
                    if (!readyToLearn) return
                    onLearnMapping(item.amazonTitle, selectedId)
                    // 成功したら UI で完了を分かりやすく
                    setSelection((prev) => ({ ...prev, [idx]: "" }))
                  }}
                >
                  <Plus className="h-4 w-4" /> このマッピングを学習する
                </Button>
              ) : (
                <p className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> onLearnMapping prop が未設定です
                </p>
              )}
            </div>

            {/* ③ 学習済み表示（※例示ロジック。必要に応じて編集可） */}
            {/* item.matched が true になったら緑色で完了表示したい場合 */}
            {item.matched && (
              <div className="flex items-center gap-1 text-emerald-600 text-sm">
                <CheckCircle2 className="h-4 w-4" /> 学習済み
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
