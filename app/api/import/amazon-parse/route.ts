// /app/api/import/amazon-parse/route.ts  ver.9  (千区切りカンマ対策版)
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { findBestMatchSimplified } from '@/lib/csvHelpers'

export const dynamic = 'force-dynamic'

// ------------------------------------------------------------
// ① CSV 1 行を手作業で分解（ver.8 と同じ実装）
// ------------------------------------------------------------
function parseCsvLine(line: string): string[] {
  const columns = []
  let currentColumn = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // 二重引用符はエスケープ
        currentColumn += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      columns.push(currentColumn.trim())
      currentColumn = ''
    } else {
      currentColumn += char
    }
  }
  columns.push(currentColumn.trim())
  return columns
}

// ★ 追加 ────────────────────────────────
/** 「1,234」のような千区切りカンマ・空白を除去して数値化 */
const cleanNumber = (raw: string) =>
  Number(raw.replace(/[,，\s]/g, '').trim() || 0)
// ────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    console.log('Amazon CSV解析開始 (ver.9 千区切り対応)')

    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json(
        { error: 'ファイルが選択されていません' },
        { status: 400 }
      )
    }

    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSVデータが不足しています（ヘッダー+データ行が必要）' },
        { status: 400 }
      )
    }

    // ----------------------------------------------------------
    // ヘッダー行から列インデックスを取得
    // ----------------------------------------------------------
    const headers = parseCsvLine(lines[0])
    const titleIndex    = headers.findIndex(h => h.includes('タイトル'))
    const quantityIndex = headers.findIndex(h => h.includes('注文された商品点数'))

    if (titleIndex === -1 || quantityIndex === -1) {
      return NextResponse.json(
        { error: 'タイトル列または数量列が見つかりません' },
        { status: 400 }
      )
    }

    // 商品マスター＆学習データを取得
    const { data: products, error: productsError } =
      await supabase.from('products').select('*')
    if (productsError)
      throw new Error(`商品マスターの取得に失敗: ${productsError.message}`)

    const { data: learningData } =
      await supabase.from('amazon_product_mapping')
                    .select('amazon_title, product_id')

    // ----------------------------------------------------------
    // 行ループ
    // ----------------------------------------------------------
    const matchedResults: any[]   = []
    const unmatchedProducts: any[] = []
    const blankTitleRows: any[]   = []   // ver.8 空欄検知機能

    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i])
      if (row.length <= Math.max(titleIndex, quantityIndex)) continue

      const amazonTitle = row[titleIndex]?.trim()
      // ★ 変更：parseInt → cleanNumber でカンマを除去して数値化
      const quantity    = cleanNumber(row[quantityIndex])  // ここだけ変更

      if (quantity <= 0) continue          // 数量0以下はスキップ

      if (!amazonTitle) {                  // タイトル空欄は保留
        blankTitleRows.push({ rowNumber: i + 1, quantity })
        continue
      }

      const matchedProduct = findBestMatchSimplified(
        amazonTitle,
        products || [],
        learningData || []
      )

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

    // ----------------------------------------------------------
    // 集計サマリーをレスポンス
    // ----------------------------------------------------------
    const matchedQuantity   = matchedResults.reduce((s, r) => s + r.quantity, 0)
    const unmatchedQuantity = unmatchedProducts.reduce((s, r) => s + r.quantity, 0)
    const blankTitleQuantity = blankTitleRows.reduce((s, r) => s + r.quantity, 0)

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
        blankTitleInfo: {
          count: blankTitleRows.length,
          quantity: blankTitleQuantity
        }
      }
    })
  } catch (error) {
    console.error('Amazon CSV解析エラー:', error)
    return NextResponse.json(
      { error: 'CSV解析中にエラーが発生しました: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
