
// /lib/csvHelpers.ts - 最終修正版（with findBestMatchSimplified）

// CSVを安全にパースする関数
export function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i += 2
        continue
      }
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
    i++
  }
  result.push(current.trim())
  return result
}

// 商品名に基づき学習データ or 商品一覧から一致候補を探す
export function findBestMatchSimplified(
  title: string,
  products: any[],
  learningData: any[]
): { matchType: 'learning' | 'product', productId: string } | null {
  const normalized = title.toLowerCase().replace(/\s/g, '')

  for (const p of learningData) {
    const target = p.rakuten_title?.toLowerCase().replace(/\s/g, '')
    if (target && normalized.includes(target)) {
      return { matchType: 'learning', productId: p.product_id }
    }
  }

  for (const p of products) {
    const name = p.name?.toLowerCase().replace(/\s/g, '')
    if (name && normalized.includes(name)) {
      return { matchType: 'product', productId: p.id }
    }
  }

  return null
}

// 重要キーワードを抽出する関数（nullや未定義にも対応）
export function extractImportantKeywords(text: any): {
  productType: string[],
  specifications: string[],
  quantities: string[],
  brands: string[]
} {
  const cleanText = typeof text === "string" ? text.toLowerCase() : ""

  const productType: string[] = []
  const specifications: string[] = []
  const quantities: string[] = []
  const brands: string[] = []

  if (cleanText.includes('チャーシュー') && !cleanText.includes('たれ') && !cleanText.includes('ソース')) {
    productType.push('チャーシュー')
  }

  return { productType, specifications, quantities, brands }
}
