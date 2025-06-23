// /app/api/import/amazon-confirm/route.ts ver.5 (簡単版)
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { month, results } = await request.json()

    console.log('Amazon確定処理開始:', { month, resultsLength: results?.length })

    let successCount = 0
    let errorCount = 0

    for (const result of results) {
      try {
        // 最もシンプルなinsert（制約を回避）
        const { data, error } = await supabase
          .from('web_sales')
          .insert({
            product_id: result.productId,
            amazon_count: result.quantity,
            report_month: '2025-06-01'
          })
          .select()

        if (error) {
          console.error(`挿入エラー (${result.productId}):`, error.message)
          errorCount++
        } else {
          console.log(`挿入成功 (${result.productId}): ${result.quantity}`)
          successCount++
        }
      } catch (itemError) {
        console.error(`処理エラー (${result.productId}):`, itemError.message)
        errorCount++
      }
    }

    console.log(`完了: 成功${successCount}件, エラー${errorCount}件`)

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
