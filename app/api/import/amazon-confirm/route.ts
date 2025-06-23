// /app/api/import/amazon-confirm/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { month, results } = await request.json()

    if (!month || !results || !Array.isArray(results)) {
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
        const { data: existingData } = await supabase
          .from('web_sales_data')
          .select('*')
          .eq('product_id', result.productId)
          .eq('month', month)
          .single()

        if (existingData) {
          // 既存データを更新（Amazon列のみ）
          const { error: updateError } = await supabase
            .from('web_sales_data')
            .update({
              amazon_count: result.quantity,
              updated_at: new Date().toISOString()
            })
            .eq('product_id', result.productId)
            .eq('month', month)

          if (updateError) {
            console.error(`更新エラー (${result.productId}):`, updateError)
            errorCount++
          } else {
            successCount++
          }
        } else {
          // 新規データを挿入
          const { error: insertError } = await supabase
            .from('web_sales_data')
            .insert({
              product_id: result.productId,
              month: month,
              amazon_count: result.quantity,
              rakuten_count: 0,
              yahoo_count: 0,
              mercari_count: 0,
              base_count: 0,
              qoo10_count: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })

          if (insertError) {
            console.error(`挿入エラー (${result.productId}):`, insertError)
            errorCount++
          } else {
            successCount++
          }
        }
      } catch (itemError) {
        console.error(`処理エラー (${result.productId}):`, itemError)
        errorCount++
      }
    }

    console.log(`Amazon確定処理完了: 成功${successCount}件, エラー${errorCount}件`)

    return NextResponse.json({
      message: 'Amazon データの更新が完了しました',
      success: true,
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
