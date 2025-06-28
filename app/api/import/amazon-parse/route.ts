// /app/api/import/amazon-parse/route.ts ver.7 (楽天ロジック移植版)
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { findBestMatchSimplified } from "@/lib/csvHelpers"

export const dynamic = 'force-dynamic'

/**
 * CSVの1行をパースする関数。引用符（"）で囲まれたフィールド内のカンマを正しく処理します。
 * (楽天API ver.9から移植)
 * @param line - CSVの1行の文字列
 * @returns 列の配列
 */
function parseCsvLine(line: string): string[] {
  const columns = [];
  let currentColumn = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // 連続する2つの引用符は、1つの引用符として扱う
      if (inQuotes && line[i + 1] === '"') {
        currentColumn += '"';
        i++; // 次の引用符をスキップ
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      columns.push(currentColumn.trim());
      currentColumn = '';
    } else {
      currentColumn += char;
    }
  }
  columns.push(currentColumn.trim());
  return columns;
}


export async function POST(request: NextRequest) {
  try {
    console.log('Amazon CSV解析開始 (ver.7 楽天ロジック移植版)')

    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSVデータが不足しています（ヘッダー+データ行が必要）' }, { status: 400 })
    }

    // ヘッダー行を解析して列インデックスを特定（Amazonの堅牢な方式を維持）
    const headers = parseCsvLine(lines[0])
    const titleIndex = headers.findIndex(h => h.includes('タイトル'))
    const quantityIndex = headers.findIndex(h => h.includes('注文された商品点数'))

    if (titleIndex === -1 || quantityIndex === -1) {
      return NextResponse.json({ 
        error: `必要な列が見つかりません。利用可能な列: ${headers.join(', ')}`,
      }, { status: 400 })
    }

    // 商品マスターとAmazon学習データを取得
    const { data: products, error: productsError } = await supabase.from('products').select('*')
    if (productsError) throw new Error(`商品マスターの取得に失敗: ${productsError.message}`)

    const { data: learningData, error: learningError } = await supabase
      .from('amazon_product_mapping')
      .select('amazon_title, product_id')
    if (learningError) console.warn('Amazon学習データの取得に失敗:', learningError.message)


    // データ行を処理
    const matchedResults: any[] = []
    const unmatchedProducts: any[] = []

    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]) // 移植した堅牢なパーサーを使用
      if (row.length <= Math.max(titleIndex, quantityIndex)) continue

      const amazonTitle = row[titleIndex]
      const quantity = parseInt(row[quantityIndex], 10) || 0

      if (!amazonTitle || quantity <= 0) continue

      const matchedProduct = findBestMatchSimplified(amazonTitle, products || [], learningData || [])

      if (matchedProduct) {
        matchedResults.push({
          productId: matchedProduct.id,
          productName: matchedProduct.name,
          amazonTitle,
          quantity,
          matched: true,
          matchType: matchedProduct.matchType || 'medium'
        })
      } else {
        unmatchedProducts.push({ amazonTitle, quantity, matched: false })
      }
    }

    const matchedQuantity = matchedResults.reduce((sum, r) => sum + r.quantity, 0)
    const unmatchedQuantity = unmatchedProducts.reduce((sum, r) => sum + r.quantity, 0)

    // フロントエンドが期待する形式でレスポンスを返却
    return NextResponse.json({
      matchedResults,
      unmatchedProducts,
      summary: {
        totalRows: lines.length - 1,
        processedRows: matchedResults.length + unmatchedProducts.length,
        matchedCount: matchedResults.length,
        unmatchedCount: unmatchedProducts.length,
        csvTotalQuantity: matchedQuantity + unmatchedQuantity,
        matchedQuantity,
        unmatchedQuantity,
      }
    })

  } catch (error) {
    console.error('Amazon CSV解析エラー:', error)
    return NextResponse.json({ 
      error: 'CSV解析中にエラーが発生しました: ' + (error as Error).message 
    }, { status: 500 })
  }
}
