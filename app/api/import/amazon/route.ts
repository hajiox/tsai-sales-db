// /app/api/import/amazon/route.ts ver.1
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/server"

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

// 商品名マッチング関数（AI風の部分一致ロジック）
function findBestMatch(amazonTitle: string, products: any[]): any | null {
  if (!amazonTitle || !products.length) return null

  // Amazon商品名のクリーニング
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

    // 各単語の一致度をチェック
    for (const amazonWord of amazonWords) {
      if (amazonWord.length < 2) continue // 短すぎる単語は無視

      for (const productWord of productWords) {
        if (productWord.includes(amazonWord) || amazonWord.includes(productWord)) {
          score += amazonWord.length
        }
      }
    }

    // 長い商品名ほど優先（既存ロジック）
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
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    }

    // ファイル内容を読み込み
    const text = await file.text()
    let csvData: string[][]

    try {
      // CSV解析 - 改良版パーサーを使用
      const lines = text.split('\n').filter(line => line.trim())
      csvData = lines.map(line => parseCSVLine(line))
    } catch (parseError) {
      console.error('CSV parse error:', parseError)
      return NextResponse.json({ error: 'CSVファイルの形式が正しくありません' }, { status: 400 })
    }

    if (csvData.length < 2) {
      return NextResponse.json({ error: 'CSVデータが不足しています' }, { status: 400 })
    }

    // ヘッダー行を取得
    const headers = csvData[0]
    console.log('CSV Headers:', headers)

    // 必要な列のインデックスを特定
    const titleIndex = headers.findIndex(h => h.includes('タイトル'))
    const quantityIndex = headers.findIndex(h => h.includes('注文された商品点数'))

    if (titleIndex === -1 || quantityIndex === -1) {
      return NextResponse.json({ 
        error: `必要な列が見つかりません。タイトル列: ${titleIndex}, 販売数量列: ${quantityIndex}` 
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

    // データ行を処理
    const results = []
    const unmatchedProducts = []
    let totalQuantity = 0

    for (let i = 1; i < csvData.length; i++) {
      const row = csvData[i]
      if (row.length <= Math.max(titleIndex, quantityIndex)) continue

      const amazonTitle = row[titleIndex]?.trim()
      const quantityStr = row[quantityIndex]?.trim()

      if (!amazonTitle || !quantityStr) continue

      const quantity = parseInt(quantityStr) || 0
      if (quantity <= 0) continue

      // 商品マッチング実行
      const matchedProduct = findBestMatch(amazonTitle, products)

      if (matchedProduct) {
        results.push({
          productId: matchedProduct.id,
          productName: matchedProduct.name,
          amazonTitle,
          quantity,
          matched: true
        })
        totalQuantity += quantity
      } else {
        unmatchedProducts.push({
          amazonTitle,
          quantity,
          matched: false
        })
      }
    }

    // 現在月を取得
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    // データベース更新処理
    let updateCount = 0
    for (const result of results) {
      try {
        const { error: upsertError } = await supabase
          .from('web_sales_summary')
          .upsert({
            product_id: result.productId,
            report_month: currentMonth,
            amazon_count: result.quantity
          }, {
            onConflict: 'product_id,report_month',
            ignoreDuplicates: false
          })

        if (upsertError) {
          console.error('Upsert error for product:', result.productId, upsertError)
        } else {
          updateCount++
        }
      } catch (updateError) {
        console.error('Update error:', updateError)
      }
    }

    // 結果レポート
    const report = {
      message: `Amazon CSVインポート完了: ${updateCount}件の商品を更新しました`,
      summary: {
        totalRows: csvData.length - 1,
        matchedProducts: results.length,
        unmatchedProducts: unmatchedProducts.length,
        totalQuantity,
        updatedRecords: updateCount
      },
      unmatchedProducts: unmatchedProducts.slice(0, 10) // 最初の10件のみ表示
    }

    console.log('Amazon CSV Import Result:', report)

    return NextResponse.json(report)

  } catch (error) {
    console.error('Amazon CSV import error:', error)
    return NextResponse.json({ error: 'インポート処理中にエラーが発生しました' }, { status: 500 })
  }
}
