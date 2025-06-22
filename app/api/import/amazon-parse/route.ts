// /app/api/import/amazon-parse/route.ts ver.1
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export const dynamic = 'force-dynamic'

// CSVを安全にパースする関数
function parseCSVLine(line: string): string[] {
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

// 商品名マッチング関数
function findBestMatch(amazonTitle: string, products: any[]): any | null {
  if (!amazonTitle || !products.length) return null

  const cleanAmazonTitle = amazonTitle
    .toLowerCase()
    .replace(/[【】\[\]()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  let bestMatch = null
  let bestScore = 0

  for (const product of products) {
    const productName = product.name.toLowerCase()
    
    // 完全一致チェック
    if (productName === cleanAmazonTitle) {
      return product
    }

    // 部分一致スコア計算
    let score = 0
    const amazonWords = cleanAmazonTitle.split(' ')
    const productWords = productName.split(' ')

    for (const amazonWord of amazonWords) {
      if (amazonWord.length < 2) continue

      for (const productWord of productWords) {
        if (productWord.includes(amazonWord) || amazonWord.includes(productWord)) {
          score += amazonWord.length
        }
      }
    }

    // 長い商品名ほど優先
    if (cleanAmazonTitle.includes(productName) || productName.includes(cleanAmazonTitle)) {
      score += product.name.length * 2
    }

    if (score > bestScore && score > cleanAmazonTitle.length * 0.3) {
      bestScore = score
      bestMatch = product
    }
  }

  return bestMatch
}

export async function POST(request: NextRequest) {
  try {
    console.log('Amazon CSV解析開始')

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    }

    console.log('ファイル受信:', file.name, 'サイズ:', file.size)

    // ファイル内容を読み込み
    const text = await file.text()
    console.log('ファイル内容長:', text.length)

    let csvData: string[][]

    try {
      // CSV解析
      const lines = text.split('\n').filter(line => line.trim())
      csvData = lines.map(line => parseCSVLine(line))
      console.log('CSV行数:', csvData.length)
    } catch (parseError) {
      console.error('CSV parse error:', parseError)
      return NextResponse.json({ error: 'CSVファイルの形式が正しくありません' }, { status: 400 })
    }

    if (csvData.length < 2) {
      return NextResponse.json({ error: 'CSVデータが不足しています（ヘッダー+データ行が必要）' }, { status: 400 })
    }

    // ヘッダー行を取得
    const headers = csvData[0]
    console.log('CSV Headers:', headers)

    // 必要な列のインデックスを特定
    const titleIndex = headers.findIndex(h => h.includes('タイトル'))
    const quantityIndex = headers.findIndex(h => h.includes('注文された商品点数'))

    console.log('タイトル列インデックス:', titleIndex)
    console.log('販売数量列インデックス:', quantityIndex)

    if (titleIndex === -1 || quantityIndex === -1) {
      return NextResponse.json({ 
        error: `必要な列が見つかりません。利用可能な列: ${headers.join(', ')}`,
        headers: headers
      }, { status: 400 })
    }

    // 商品マスターデータを取得
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')

    if (productsError) {
      console.error('Products fetch error:', productsError)
      return NextResponse.json({ error: '商品データの取得に失敗しました' }, { status: 500 })
    }

    console.log('商品マスター件数:', products?.length || 0)

    // データ行を処理
    const matchedResults = []
    const unmatchedProducts = []

    for (let i = 1; i < csvData.length; i++) {
      const row = csvData[i]
      if (row.length <= Math.max(titleIndex, quantityIndex)) continue

      const amazonTitle = row[titleIndex]?.trim()
      const quantityStr = row[quantityIndex]?.trim()

      if (!amazonTitle || !quantityStr) continue

      const quantity = parseInt(quantityStr) || 0
      if (quantity <= 0) continue

      // 商品マッチング実行
      const matchedProduct = findBestMatch(amazonTitle, products || [])

      if (matchedProduct) {
        matchedResults.push({
          productId: matchedProduct.id,
          productName: matchedProduct.name,
          amazonTitle,
          quantity,
          matched: true
        })
      } else {
        unmatchedProducts.push({
          amazonTitle,
          quantity,
          matched: false
        })
      }
    }

    console.log('マッチング結果:', {
      matched: matchedResults.length,
      unmatched: unmatchedProducts.length
    })

    return NextResponse.json({
      matchedResults,
      unmatchedProducts: unmatchedProducts.slice(0, 10),
      summary: {
        totalRows: csvData.length - 1,
        matchedCount: matchedResults.length,
        unmatchedCount: unmatchedProducts.length
      }
    })

  } catch (error) {
    console.error('Amazon CSV解析エラー:', error)
    return NextResponse.json({ 
      error: 'CSV解析中にエラーが発生しました: ' + (error as Error).message 
    }, { status: 500 })
  }
}
