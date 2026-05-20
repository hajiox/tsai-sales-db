// /app/web-sales/advertising/rakuten-search-request-tab.tsx
// 楽天サーチ申請プロンプト生成タブ
"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
  AlertCircle,
  Check,
  ClipboardCopy,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

interface ProductRow {
  id: string
  name: string
  series: string | null
  series_code: number | null
  product_code: number | string | null
  product_number: number | string | null
  global_product_id: number | string | null
  price: number | null
  profit_rate: number | null
  is_hidden: boolean | null
}

interface RakutenProductMapping {
  rakuten_title: string
  product_id: string
  created_at: string | null
}

interface RakutenProductName {
  product_code: string
  product_name: string
}

interface RakutenAdRow {
  product_code: string
  product_url: string | null
  report_month: string
  amount_spent: number | null
  series_code: number | null
}

interface RecipeJanRow {
  linked_product_id: string
  jan_code: string
  name: string | null
  category: string | null
}

interface RakutenSalesRow {
  product_id: string
  rakuten_count: number | null
}

interface RakutenCandidate {
  productCode: string
  productUrl: string | null
  productName: string | null
  source: string
  score: number
}

interface SelectedPromptItem {
  product: ProductRow
  managementNumber: string
  discountRate: number
  salePrice: number
  rakutenName: string | null
  rakutenUrl: string | null
}

const MIN_DISCOUNT_RATE = 10

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[【】\[\]（）()・,，、。.\s　_\-－―~〜～/／:：|｜"'“”‘’]/g, "")
}

function textMatchScore(left: string, right: string): number {
  const a = normalizeText(left)
  const b = normalizeText(right)
  if (!a || !b) return 0
  if (a === b) return 100
  if (a.includes(b) || b.includes(a)) return 80

  const shorter = a.length < b.length ? a : b
  const longer = a.length < b.length ? b : a
  if (shorter.length < 8) return 0
  const windowLength = Math.min(shorter.length, 18)
  for (let i = 0; i <= shorter.length - windowLength; i += 1) {
    const part = shorter.slice(i, i + windowLength)
    if (longer.includes(part)) return 55
  }
  return 0
}

function coerceDiscountRate(value: number): number {
  if (!Number.isFinite(value)) return MIN_DISCOUNT_RATE
  return Math.max(MIN_DISCOUNT_RATE, Math.min(90, Math.floor(value)))
}

function calculateSalePrice(price: number | null, discountRate: number): number {
  if (!price || price <= 0) return 0
  return Math.floor(price * ((100 - discountRate) / 100))
}

function formatCurrency(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-"
  return `¥${Math.round(value).toLocaleString()}`
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "")
}

function compactProductNumber(product: ProductRow): string {
  const values = [product.product_number, product.product_code, product.global_product_id]
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .map((v) => String(v))
  return values.length > 0 ? values.join(" / ") : "-"
}

function buildCandidate(
  code: string,
  source: string,
  score: number,
  productNamesByCode: Map<string, string>,
  latestAdsByCode: Map<string, RakutenAdRow>
): RakutenCandidate {
  const ad = latestAdsByCode.get(code)
  return {
    productCode: code,
    productUrl: ad?.product_url || null,
    productName: productNamesByCode.get(code) || null,
    source,
    score,
  }
}

function resolveRakutenCandidate(
  product: ProductRow,
  productMappings: RakutenProductMapping[],
  productNamesByCode: Map<string, string>,
  latestAdsByCode: Map<string, RakutenAdRow>,
  recipeJanByProductId: Map<string, RecipeJanRow>,
  adCodesBySeries: Map<number, string[]>
): RakutenCandidate | null {
  const candidates = new Map<string, RakutenCandidate>()

  const addCandidate = (candidate: RakutenCandidate) => {
    const current = candidates.get(candidate.productCode)
    if (!current || candidate.score > current.score) {
      candidates.set(candidate.productCode, candidate)
    }
  }

  const directCodes = [product.product_number, product.product_code, product.global_product_id]
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .map((v) => String(v).trim())

  directCodes.forEach((code) => {
    if (productNamesByCode.has(code) || latestAdsByCode.has(code)) {
      addCandidate(buildCandidate(code, "TSA番号と楽天商品コードが一致", 95, productNamesByCode, latestAdsByCode))
    }
  })

  const mappedTitles = productMappings
    .filter((mapping) => mapping.product_id === product.id)
    .map((mapping) => mapping.rakuten_title)

  productNamesByCode.forEach((rakutenName, code) => {
    const nameScore = textMatchScore(product.name, rakutenName)
    if (nameScore >= 55) {
      addCandidate(buildCandidate(code, "楽天商品名とTSA商品名が近い", nameScore, productNamesByCode, latestAdsByCode))
    }

    mappedTitles.forEach((title) => {
      const titleScore = textMatchScore(title, rakutenName)
      if (titleScore >= 55) {
        addCandidate(buildCandidate(code, "楽天売上CSV学習データから推定", titleScore + 10, productNamesByCode, latestAdsByCode))
      }
    })
  })

  if (candidates.size === 0 && product.series_code !== null) {
    const seriesCodes = adCodesBySeries.get(product.series_code) || []
    if (seriesCodes.length === 1) {
      addCandidate(buildCandidate(seriesCodes[0], "同一シリーズの楽天広告データが1件のみ", 45, productNamesByCode, latestAdsByCode))
    }
  }

  if (candidates.size === 0) {
    const recipeJan = recipeJanByProductId.get(product.id)
    const janCode = recipeJan ? digitsOnly(recipeJan.jan_code) : ""
    if (janCode) {
      addCandidate({
        productCode: janCode,
        productUrl: latestAdsByCode.get(janCode)?.product_url || null,
        productName: productNamesByCode.get(janCode) || recipeJan?.name || null,
        source: "レシピJANコードから補完",
        score: 70,
      })
    }
  }

  const sorted = Array.from(candidates.values()).sort((a, b) => b.score - a.score)
  return sorted[0] || null
}

async function fetchAllRakutenSalesRows(
  supabase: ReturnType<typeof getSupabaseBrowserClient>
): Promise<RakutenSalesRow[]> {
  const rows: RakutenSalesRow[] = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("web_sales_summary")
      .select("product_id,rakuten_count")
      .gt("rakuten_count", 0)
      .range(from, from + pageSize - 1)

    if (error) throw error
    rows.push(...((data || []) as RakutenSalesRow[]))
    if (!data || data.length < pageSize) break
  }

  return rows
}

function buildPrompt(params: {
  items: SelectedPromptItem[]
}): string {
  const tableRows = params.items.map((item, index) => {
    const originalPrice = item.product.price || 0
    return [
      String(index + 1),
      item.product.name,
      item.managementNumber,
      item.rakutenName || "-",
      originalPrice > 0 ? String(Math.round(originalPrice)) : "-",
      `${item.discountRate}%`,
      item.salePrice > 0 ? String(item.salePrice) : "-",
      item.rakutenUrl || "-",
    ].join(" | ")
  })

  return [
    "TSAの楽天サーチ申請タブで選定した商品について、楽天RMSでサーチ申請作業を実行してください。",
    "ブラウザ操作は最初からChrome拡張のログイン済みブラウザで実行してください。Codex内蔵ブラウザは使わないでください。",
    "",
    "重要:",
    "- この作業はAPIでは実行できないため、楽天RMS画面を実際に操作してください。",
    "- 商品の販売価格変更、販売期間設定、イベント商品申請の送信まで実行してください。",
    "- RMS画面の項目名・導線・確認文言がこの指示と異なる場合は、推測で進めずユーザーに確認してください。",
    "- 楽天の規約・ガイドライン上の疑義、二重価格表示条件の疑義、同一商品のより安い販売ページなどを見つけた商品は、その商品だけ保留して理由を報告してください。",
    "- 申請送信・価格変更・販売期間変更以外の不要な項目は変更しないでください。",
    "",
    "対象イベント:",
    "- 楽天RMSの 店舗設定 → 商品管理 → イベント商品申請 を開き、画面に表示されている直近/受付中のイベントを対象にしてください。",
    "- この画面に対象イベントが1つだけ表示される前提です。表示されているイベント名・販売期間を読み取り、商品の販売期間設定にも同じ開始日時/終了日時を使ってください。",
    "- イベント名または販売期間が読めない場合、または複数イベントが表示された場合は、推測せず作業を止めてユーザーに確認してください。",
    "- 割引率は10%未満にしないでください。",
    "- セール価格はTSAで算出済みです。RMSで税設定やSKU設定により差異が出る場合は、10%以上の割引になる価格を優先してください。",
    "",
    "対象商品:",
    "No | TSA商品名 | 楽天商品管理番号 | 楽天商品名候補 | 通常価格 | 割引率 | セール価格 | 楽天URL候補",
    "--- | --- | --- | --- | --- | --- | --- | ---",
    ...tableRows,
    "",
    "作業手順:",
    "1. 楽天RMSトップから、店舗設定 → 商品管理 → イベント商品申請へ進む。",
    "2. 画面に表示されている対象イベントのイベント名・販売開始日時・販売終了日時を読み取り、作業メモに記録する。",
    "3. 店舗設定 → 商品管理 → 商品一覧・登録へ進む。",
    "4. 対象商品を楽天商品管理番号で検索し、商品編集画面を開く。",
    "5. 変更前の販売価格、表示価格、販売期間、倉庫/販売状態、対象SKUがある場合はSKU価格を記録する。",
    "6. 販売価格を上記のセール価格に変更する。",
    "7. 販売期間をRMSイベント商品申請画面で読み取った開始日時・終了日時に設定する。",
    "8. 二重価格表示の項目がある場合は、元値が現在の通常価格として扱われる設定になっているか確認する。必要な場合のみ当店通常価格を元値にする。",
    "9. 商品編集内容を保存し、エラーが出ないことを確認する。",
    "10. 全商品の価格・販売期間設定が終わったら、店舗設定 → 商品管理 → イベント商品申請へ戻る。",
    "11. 個別申請または一括申請で、対象商品の楽天商品管理番号を登録する。RMSで一括申請CSVが必要な場合は、対象商品の楽天商品管理番号を使ってCSVを作成しアップロードしてよい。",
    "12. 確認事項が表示された場合は、内容を読み、対象商品に問題がない場合のみ同意して申請を送信する。",
    "13. 申請完了画面または結果一覧で、申請が受け付けられたことを確認する。",
    "",
    "完了報告:",
    "- 申請送信済みの商品管理番号",
    "- 保留した商品と理由",
    "- 各商品の変更前価格/変更後価格/販売期間",
    "- 申請結果画面で見えたステータス",
    "- SALE後に販売再開・復旧するために必要な変更前情報",
  ].join("\n")
}

export default function RakutenSearchRequestTab() {
  const supabase = getSupabaseBrowserClient()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [productMappings, setProductMappings] = useState<RakutenProductMapping[]>([])
  const [productNames, setProductNames] = useState<RakutenProductName[]>([])
  const [adRows, setAdRows] = useState<RakutenAdRow[]>([])
  const [recipeJanRows, setRecipeJanRows] = useState<RecipeJanRow[]>([])
  const [rakutenSalesProductIds, setRakutenSalesProductIds] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [discounts, setDiscounts] = useState<Map<string, string>>(new Map())
  const [manualNumbers, setManualNumbers] = useState<Map<string, string>>(new Map())
  const [query, setQuery] = useState("")
  const [onlySelected, setOnlySelected] = useState(false)
  const [includeNoSalesCandidates, setIncludeNoSalesCandidates] = useState(false)
  const [bulkDiscount, setBulkDiscount] = useState("10")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [productsRes, mappingsRes, namesRes, adsRes, recipesRes, salesRows] = await Promise.all([
        supabase
          .from("products")
          .select("id,name,series,series_code,product_code,product_number,global_product_id,price,profit_rate,is_hidden")
          .eq("is_hidden", false)
          .order("series_code", { ascending: true })
          .order("product_code", { ascending: true }),
        supabase.from("rakuten_product_mapping").select("rakuten_title,product_id,created_at"),
        supabase.from("rakuten_product_names").select("product_code,product_name"),
        supabase
          .from("rakuten_ads_performance")
          .select("product_code,product_url,report_month,amount_spent,series_code")
          .order("report_month", { ascending: false })
          .limit(3000),
        supabase
          .from("recipes")
          .select("linked_product_id,jan_code,name,category")
          .not("linked_product_id", "is", null)
          .not("jan_code", "is", null),
        fetchAllRakutenSalesRows(supabase),
      ])

      if (productsRes.error) throw productsRes.error
      if (mappingsRes.error) throw mappingsRes.error
      if (namesRes.error) throw namesRes.error
      if (adsRes.error) throw adsRes.error
      if (recipesRes.error) throw recipesRes.error

      setProducts((productsRes.data || []) as ProductRow[])
      setProductMappings((mappingsRes.data || []) as RakutenProductMapping[])
      setProductNames((namesRes.data || []) as RakutenProductName[])
      setAdRows((adsRes.data || []) as RakutenAdRow[])
      setRecipeJanRows((recipesRes.data || []) as RecipeJanRow[])
      const soldProductIds = (salesRows || [])
        .map((row) => row.product_id)
        .filter((productId): productId is string => Boolean(productId))
      setRakutenSalesProductIds(new Set(soldProductIds))
    } catch (err) {
      const message = err instanceof Error ? err.message : "データ取得に失敗しました"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const productNamesByCode = useMemo(() => {
    const map = new Map<string, string>()
    productNames.forEach((item) => map.set(item.product_code, item.product_name))
    return map
  }, [productNames])

  const latestAdsByCode = useMemo(() => {
    const map = new Map<string, RakutenAdRow>()
    adRows.forEach((row) => {
      if (!map.has(row.product_code)) {
        map.set(row.product_code, row)
      }
    })
    return map
  }, [adRows])

  const adCodesBySeries = useMemo(() => {
    const map = new Map<number, Set<string>>()
    adRows.forEach((row) => {
      if (row.series_code === null) return
      const current = map.get(row.series_code) || new Set<string>()
      current.add(row.product_code)
      map.set(row.series_code, current)
    })
    const result = new Map<number, string[]>()
    map.forEach((value, key) => result.set(key, Array.from(value)))
    return result
  }, [adRows])

  const recipeJanByProductId = useMemo(() => {
    const sortedRows = [...recipeJanRows].sort((a, b) => {
      if (a.category === "ネット専用" && b.category !== "ネット専用") return -1
      if (a.category !== "ネット専用" && b.category === "ネット専用") return 1
      return 0
    })
    const map = new Map<string, RecipeJanRow>()
    sortedRows.forEach((row) => {
      const janCode = digitsOnly(row.jan_code || "")
      if (row.linked_product_id && janCode && !map.has(row.linked_product_id)) {
        map.set(row.linked_product_id, { ...row, jan_code: janCode })
      }
    })
    return map
  }, [recipeJanRows])

  const candidatesByProductId = useMemo(() => {
    const map = new Map<string, RakutenCandidate | null>()
    products.forEach((product) => {
      map.set(
        product.id,
        resolveRakutenCandidate(product, productMappings, productNamesByCode, latestAdsByCode, recipeJanByProductId, adCodesBySeries)
      )
    })
    return map
  }, [products, productMappings, productNamesByCode, latestAdsByCode, recipeJanByProductId, adCodesBySeries])

  const visibleProducts = useMemo(() => {
    if (includeNoSalesCandidates) return products
    return products.filter((product) => rakutenSalesProductIds.has(product.id))
  }, [products, includeNoSalesCandidates, rakutenSalesProductIds])

  const rakutenSalesCount = useMemo(() => {
    return products.filter((product) => rakutenSalesProductIds.has(product.id)).length
  }, [products, rakutenSalesProductIds])

  const filteredProducts = useMemo(() => {
    const normalizedQuery = normalizeText(query)
    return visibleProducts.filter((product) => {
      if (onlySelected && !selectedIds.has(product.id)) return false
      if (!normalizedQuery) return true
      const candidate = candidatesByProductId.get(product.id)
      const searchText = normalizeText([
        product.name,
        product.series || "",
        compactProductNumber(product),
        candidate?.productCode || "",
        candidate?.productName || "",
      ].join(" "))
      return searchText.includes(normalizedQuery)
    })
  }, [visibleProducts, query, onlySelected, selectedIds, candidatesByProductId])

  const selectedPromptItems = useMemo(() => {
    return products
      .filter((product) => selectedIds.has(product.id))
      .map((product) => {
        const candidate = candidatesByProductId.get(product.id)
        const managementNumber = (manualNumbers.get(product.id) || candidate?.productCode || "").trim()
        const discountRate = coerceDiscountRate(Number(discounts.get(product.id) ?? MIN_DISCOUNT_RATE))
        return {
          product,
          managementNumber,
          discountRate,
          salePrice: calculateSalePrice(product.price, discountRate),
          rakutenName: candidate?.productName || null,
          rakutenUrl: candidate?.productUrl || null,
        }
      })
  }, [products, selectedIds, candidatesByProductId, manualNumbers, discounts])

  const missingNumberItems = selectedPromptItems.filter((item) => !item.managementNumber)
  const canCopyPrompt = selectedPromptItems.length > 0 && missingNumberItems.length === 0
  const prompt = useMemo(() => {
    if (!canCopyPrompt) return ""
    return buildPrompt({
      items: selectedPromptItems,
    })
  }, [canCopyPrompt, selectedPromptItems])

  const toggleProduct = (productId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const updateDiscount = (productId: string, rawValue: string) => {
    setDiscounts((current) => {
      const next = new Map(current)
      next.set(productId, rawValue)
      return next
    })
  }

  const normalizeDiscountInput = (productId: string) => {
    setDiscounts((current) => {
      const next = new Map(current)
      next.set(productId, String(coerceDiscountRate(Number(current.get(productId) ?? MIN_DISCOUNT_RATE))))
      return next
    })
  }

  const updateManualNumber = (productId: string, value: string) => {
    setManualNumbers((current) => {
      const next = new Map(current)
      next.set(productId, value)
      return next
    })
  }

  const selectProductsWithRakutenCode = () => {
    const ids = new Set<string>()
    filteredProducts.forEach((product) => {
      const candidate = candidatesByProductId.get(product.id)
      if (candidate?.productCode) ids.add(product.id)
    })
    setSelectedIds(ids)
  }

  const applyBulkDiscount = () => {
    const normalized = coerceDiscountRate(Number(bulkDiscount))
    setBulkDiscount(String(normalized))
    setDiscounts((current) => {
      const next = new Map(current)
      selectedIds.forEach((id) => next.set(id, String(normalized)))
      return next
    })
  }

  const handleCopyPrompt = async () => {
    if (!prompt) return
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-red-500" />
        楽天サーチ申請用の商品データを読み込み中...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-red-100 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <Sparkles className="h-5 w-5 text-red-600" />
              楽天サーチ申請
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              楽天RMSで価格変更・販売期間設定・イベント商品申請を実行するためのCodex指示文を生成します。
            </p>
            <p className="mt-1 text-xs text-gray-500">
              通常は過去の楽天販売実績がある商品だけを表示します。新商品は「販売実績なしも表示」で検索して選択できます。
              コード未設定の商品だけ、レシピ側JANコードで補完します。
            </p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
            割引率は10%未満にできません
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="mr-1 inline h-4 w-4" />
            {error}
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="text-xs font-medium text-gray-600">対象イベント</div>
            <div className="mt-1 text-sm font-medium text-gray-900">RMSイベント商品申請ページに表示されているイベント</div>
            <div className="mt-1 text-xs text-gray-500">
              生成プロンプト側でCodexにイベント名・販売期間を読み取らせ、その期間で商品販売期間も設定させます。
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-gray-600">一括割引率</span>
            <div className="flex gap-2">
              <input
                type="number"
                min={MIN_DISCOUNT_RATE}
                max={90}
                value={bulkDiscount}
                onChange={(e) => setBulkDiscount(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={applyBulkDiscount}
                disabled={selectedIds.size === 0}
                className="whitespace-nowrap rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-gray-300"
              >
                適用
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="商品名・シリーズ・楽天商品管理番号で検索"
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOnlySelected((value) => !value)}
              className={`rounded-md border px-3 py-2 text-sm ${onlySelected ? "border-red-200 bg-red-50 text-red-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
            >
              選択中のみ
            </button>
            <button
              type="button"
              onClick={() => setIncludeNoSalesCandidates((value) => !value)}
              className={`rounded-md border px-3 py-2 text-sm ${includeNoSalesCandidates ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
            >
              販売実績なしも表示
            </button>
            <button
              type="button"
              onClick={selectProductsWithRakutenCode}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              表示中の番号ありを選択
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              選択解除
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="w-12 px-3 py-3 text-center">選択</th>
                <th className="px-3 py-3 text-left">商品</th>
                <th className="w-32 px-3 py-3 text-left">TSA番号</th>
                <th className="w-48 px-3 py-3 text-left">楽天商品管理番号</th>
                <th className="w-40 px-3 py-3 text-left">推定元</th>
                <th className="w-24 px-3 py-3 text-right">通常価格</th>
                <th className="w-24 px-3 py-3 text-right">割引率</th>
                <th className="w-28 px-3 py-3 text-right">セール価格</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredProducts.map((product) => {
                const candidate = candidatesByProductId.get(product.id)
                const selected = selectedIds.has(product.id)
                const hasRakutenSales = rakutenSalesProductIds.has(product.id)
                const discountRate = coerceDiscountRate(Number(discounts.get(product.id) ?? MIN_DISCOUNT_RATE))
                const managementNumber = manualNumbers.get(product.id) ?? candidate?.productCode ?? ""
                const salePrice = calculateSalePrice(product.price, discountRate)
                return (
                  <tr key={product.id} className={selected ? "bg-red-50/40" : "bg-white"}>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleProduct(product.id)}
                        className="h-4 w-4 rounded border-gray-300 text-red-600"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
                        <span>{product.name}</span>
                        {!hasRakutenSales && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            販売実績なし
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">{product.series || "シリーズ未設定"}</div>
                      {candidate?.productName && (
                        <div className="mt-1 truncate text-xs text-red-700">楽天候補: {candidate.productName}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{compactProductNumber(product)}</td>
                    <td className="px-3 py-3">
                      <input
                        value={managementNumber}
                        onChange={(e) => updateManualNumber(product.id, e.target.value)}
                        placeholder="未推定"
                        className={`w-full rounded-md border px-2 py-1.5 text-sm ${selected && !managementNumber.trim() ? "border-red-300 bg-red-50" : "border-gray-300"}`}
                      />
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">
                      {candidate ? (
                        <div>
                          <div>{candidate.source}</div>
                          {candidate.productUrl && (
                            <a href={candidate.productUrl} target="_blank" rel="noreferrer" className="text-red-600 hover:underline">
                              楽天ページ
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-700">手入力が必要</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(product.price)}</td>
                    <td className="px-3 py-3 text-right">
                      <input
                        type="number"
                        min={MIN_DISCOUNT_RATE}
                        max={90}
                        value={discounts.get(product.id) ?? String(MIN_DISCOUNT_RATE)}
                        onChange={(e) => updateDiscount(product.id, e.target.value)}
                        onBlur={() => normalizeDiscountInput(product.id)}
                        className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm"
                      />
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-red-700">
                      {salePrice > 0 ? formatCurrency(salePrice) : "-"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-500">
          表示中 {filteredProducts.length}件 / 楽天販売実績あり {rakutenSalesCount}件 / 全WEB商品 {products.length}件
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4 text-red-600" />
              生成プロンプト
            </h3>
            <button
              type="button"
              onClick={handleCopyPrompt}
              disabled={!canCopyPrompt}
              className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-gray-300"
            >
              {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
              {copied ? "コピー済み" : "プロンプトをコピー"}
            </button>
          </div>

          {!canCopyPrompt && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertCircle className="mr-1 inline h-4 w-4" />
              商品選択、楽天商品管理番号、イベント名、販売期間を入力するとプロンプトを生成できます。
            </div>
          )}

          {missingNumberItems.length > 0 && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              楽天商品管理番号が未入力の商品があります: {missingNumberItems.map((item) => item.product.name).join("、")}
            </div>
          )}

          <textarea
            value={prompt}
            readOnly
            placeholder="ここにCodexへ渡す楽天RMS操作プロンプトが表示されます。"
            className="h-[420px] w-full resize-none rounded-md border border-gray-300 bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-800"
          />
        </div>

        <div className="rounded-lg border bg-white p-4">
          <h3 className="font-semibold">選定サマリー</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-gray-50 p-3">
              <div className="text-xs text-gray-500">選択商品</div>
              <div className="mt-1 text-xl font-bold">{selectedPromptItems.length}</div>
            </div>
            <div className="rounded-md bg-gray-50 p-3">
              <div className="text-xs text-gray-500">番号未入力</div>
              <div className={`mt-1 text-xl font-bold ${missingNumberItems.length > 0 ? "text-red-600" : "text-gray-900"}`}>
                {missingNumberItems.length}
              </div>
            </div>
          </div>
          <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {selectedPromptItems.length === 0 ? (
              <p className="text-sm text-gray-500">まだ商品が選択されていません。</p>
            ) : (
              selectedPromptItems.map((item) => (
                <div key={item.product.id} className="rounded-md border border-gray-200 p-3 text-sm">
                  <div className="font-medium text-gray-900">{item.product.name}</div>
                  <div className="mt-1 text-xs text-gray-500">楽天商品管理番号: {item.managementNumber || "未入力"}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {formatCurrency(item.product.price)} → <span className="font-semibold text-red-700">{formatCurrency(item.salePrice)}</span> ({item.discountRate}%引き)
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
