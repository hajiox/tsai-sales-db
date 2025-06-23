// /app/api/import/amazon-confirm/route.ts ver.6 (date型対応版)
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { month, results } = await request.json()

    console.log('Amazon確定処理 - 受信データ:', { month, resultsLength: results?.length })

    if (!month || !results || !Array.isArray(results)) {
      console.error('Amazon確定処理 - データ不足:', { month, results })
      return NextResponse.json(
        { error: '必要なデータが不足しています' },
        { status: 400 }
      )
    }

    console.log(`Amazon確定処理開始: ${month}月, ${results.length}件`)

    let successCount = 0
    let errorCount = 0

    for (const result of results) {
      try {
        console.log(`処理中: product_id=${result.productId}, quantity=${result.quantity}`)
        
        // 日付を適切な形式に変換（YYYY-MM-DD）
        const reportDate = `${month}-01`
        
        console.log('使用する日付:', reportDate)

        // upsert処理（既存データがあれば更新、なければ挿入）
        const { data, error } = await supabase
          .from('web_sales')
          .upsert({
            product_id: result.productId,
            amazon_count: result.quantity,
            report_month: reportDate,
            report_date: reportDate,
            created_at: new Date().toISOString()
          }, {
            onConflict: 'product_id,report_month'
          })
          .select()

        if (error) {
          console.error(`upsertエラー (${result.productId}):`, error)
          errorCount++
        } else {
          console.log(`upsert成功 (${result.productId}):`, result.quantity, 'データ:', data)
          successCount++
        }
      } catch (itemError) {
        console.error(`処理エラー (${result.productId}):`, itemError)
        errorCount++
      }
    }

    console.log(`Amazon確定処理完了: 成功${successCount}件, エラー${errorCount}件`)

    return NextResponse.json({
      message: `Amazon データの更新が完了しました (成功: ${successCount}件, エラー: ${errorCount}件)`,
      success: successCount > 0,
      successCount,
      errorCount,
      totalCount: results.length
    })

  } catch (error) {
    console.error('Amazon確定API エラー:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました: ' + error.message },
      { status: 500 }
    )
  }
}
