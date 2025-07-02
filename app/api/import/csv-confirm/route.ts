// /app/api/import/csv-confirm/route.ts (ver.5 - 関数呼び出し版)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Supabaseクライアントの初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { items, month } = await request.json()

    if (!items || !Array.isArray(items) || !month) {
      return NextResponse.json({ error: 'リクエストデータが無効です' }, { status: 400 })
    }

    let savedCount = 0
    let learnedCount = 0
    let totalQuantity = 0
    const errors = []

    for (const item of items) {
      if (!item.productId) {
        console.warn(`商品ID未設定のためスキップ: ${item.csvTitle}`)
        continue
      }

      const params = {
        p_product_id: item.productId,
        p_report_month: month,
        p_amazon_count: Number(item.amazonCount) || 0,
        p_rakuten_count: Number(item.rakutenCount) || 0,
        p_yahoo_count: Number(item.yahooCount) || 0,
        p_mercari_count: Number(item.mercariCount) || 0,
        p_base_count: Number(item.baseCount) || 0,
        p_qoo10_count: Number(item.qoo10Count) || 0,
      }
      
      totalQuantity += params.p_amazon_count + params.p_rakuten_count + params.p_yahoo_count + params.p_mercari_count + params.p_base_count + params.p_qoo10_count

      // ★★★ 新しく作成したデータベース関数を呼び出す ★★★
      const { error } = await supabase.rpc('process_sales_data', params)

      if (error) {
        console.error(`DB関数実行エラー (${item.csvTitle}):`, error)
        errors.push({ title: item.csvTitle, message: error.message })
        continue
      }
      
      savedCount++

      // CSV学習データの保存ロジック（変更なし）
      const { data: existingMapping } = await supabase
        .from('csv_product_mapping')
        .select('csv_title')
        .eq('csv_title', item.csvTitle)
        .single()

      if (!existingMapping) {
        const { error: learningError } = await supabase
          .from('csv_product_mapping')
          .insert({ csv_title: item.csvTitle, product_id: item.productId })
        if (learningError) {
          console.error(`CSV学習データ保存エラー (${item.csvTitle}):`, learningError)
        } else {
          learnedCount++
        }
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        message: '一部のデータの保存中にエラーが発生しました。',
        errors,
        savedCount,
        learnedCount,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `${month}のCSVデータを保存しました`,
      savedCount,
      learnedCount,
      totalQuantity,
      month: month
    })

  } catch (error) {
    console.error('CSV Confirm API エラー:', error)
    return NextResponse.json({
      error: 'CSV保存中に予期せぬエラーが発生しました',
      details: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 })
  }
}
