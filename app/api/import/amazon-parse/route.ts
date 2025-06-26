// /app/api/import/amazon-parse/route.ts ver.6 (46個差異修正版・分割)
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { parseCSVLine, findBestMatchSimplified } from "@/lib/csvHelpers"

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    console.log('Amazon CSV解析開始 (46個差異修正版)')

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

    // 学習データを取得（過去のマッチング履歴）
    const { data: learningData, error: learningError } = await supabase
      .from('amazon_product_mapping')
      .select('amazon_title, product_id')

    if (learningError) {
      console.log('学習データ取得エラー（スキップ）:', learningError.message)
    }

    console.log('学習データ件数:', learningData?.length || 0)

    // データ行を処理
    const matchedResults = []
    const unmatchedProducts = []
    let processedRows = 0  // 🔥 処理した行数をカウント
    let skippedRowsDetail = []  // 🔥 スキップした行の詳細

    for (let i = 1; i < csvData.length; i++) {
      const row = csvData[i]
      if (row.length <= Math.max(titleIndex, quantityIndex)) {
        skippedRowsDetail.push(`行${i + 1}: 列数不足`)
        continue
      }

      const amazonTitle = row[titleIndex]?.trim()
      const quantityStr = row[quantityIndex]?.trim()

      // 🔥 数量が0以下の場合のみスキップ（商品名が空欄でも処理する）
      const quantity = parseInt(quantityStr) || 0
      if (quantity <= 0) {
        skippedRowsDetail.push(`行${i + 1}: 数量0以下 (${quantityStr})`)
        continue
      }

      processedRows++  // 🔥 処理行数カウント

      // 🔥 商品名が空欄の場合は未マッチング商品として処理
      if (!amazonTitle) {
        unmatchedProducts.push({
          amazonTitle: `[商品名なし]行${i + 1}番_数量${quantity}`,  // 🔥 識別用の名前を付ける
          quantity,
          matched: false,
          rowNumber: i + 1  // 🔥 行番号を記録
        })
        console.log(`商品名空欄を未マッチングに追加: 行${i + 1}, 数量${quantity}`)
        continue
      }

      // シンプルマッチング実行
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
        unmatchedProducts.push({
          amazonTitle,
          quantity,
          matched: false
        })
      }
    }

    // 🔥 詳細ログ出力
    console.log('CSV処理詳細:', {
      総行数: csvData.length - 1,
      処理行数: processedRows,
      マッチング成功: matchedResults.length,
      未マッチング: unmatchedProducts.length,
      スキップした行: skippedRowsDetail
    })

    const csvTotalQuantity = matchedResults.reduce((sum, r) => sum + r.quantity, 0) + unmatchedProducts.reduce((sum, r) => sum + r.quantity, 0)

    return NextResponse.json({
      matchedResults,
      unmatchedProducts: unmatchedProducts.slice(0, 50), // 最大50件表示
      summary: {
        totalRows: csvData.length - 1,  // 🔥 実際のCSV行数
        processedRows,  // 🔥 実際に処理した行数
        matchedCount: matchedResults.length,
        unmatchedCount: unmatchedProducts.length,
        csvTotalQuantity,  // 🔥 実際に処理した数量の合計
        matchedQuantity: matchedResults.reduce((sum, r) => sum + r.quantity, 0),
        unmatchedQuantity: unmatchedProducts.reduce((sum, r) => sum + r.quantity, 0),
        skippedRows: skippedRowsDetail.length,  // 🔥 スキップした行数
        skippedDetails: skippedRowsDetail  // 🔥 スキップした行の詳細
      }
    })

  } catch (error) {
    console.error('Amazon CSV解析エラー:', error)
    return NextResponse.json({ 
      error: 'CSV解析中にエラーが発生しました: ' + (error as Error).message 
    }, { status: 500 })
  }
}
