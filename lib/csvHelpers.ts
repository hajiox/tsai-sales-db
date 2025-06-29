
// /lib/csvHelpers.ts - 修正済みバージョン

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

  // 以下、必要に応じて既存条件を追加してください

  return { productType, specifications, quantities, brands }
}
