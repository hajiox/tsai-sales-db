// /app/api/import/amazon-confirm/route.ts ver.9 (upsert対応版)
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { month, results } = await request.json()

    console.log('Amazon確定処理開始:', { month, resultsLength: results?.length })

    if (!month || !results || !Array.isArray(results)) {
      return NextResponse.json(
        { error: '必要なデータが不足しています' },
        { status: 400 }
      )
    }

    let successCount = 0
    let errorCount = 0

    for (const result of results) {
      try {
        console.log(`処理中: product_id=${result.productId}, quantity=${result.quantity}`)
        
        // upsert処理（重複対応）
        const { data, error } = await supabase
          .from('web_sales_summary')
          .upsert({
            product_id: result.productId,
            amazon_count: result.quantity,
            report_month: `${month}-01`
          }, {
            onConflict: 'product_id,report_month'
          })
          .select()

        if (error) {
          console.error(`upsertエラー (${result.productId}):`, error.message)
          errorCount++
        } else {
          console.log(`upsert成功 (${result.productId}):`, result.quantity)
          successCount++
        }
      } catch (itemError) {
        console.error(`処理エラー (${result.productId}):`, itemError.message)
        errorCount++
      }
    }

    console.log(`Amazon確定処理完了: 成功${successCount}件, エラー${errorCount}件`)

    return NextResponse.json({
      message: `Amazon データの更新が完了しました (成功: ${successCount}件)`,
      success: successCount > 0,
      successCount,
      errorCount,
      totalCount: results.length
    })

  } catch (error) {
    console.error('Amazon確定API エラー:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}
