// /app/api/import/amazon-confirm/route.ts ver.3 (実テーブル構造対応版)
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
        // 月の形式を統一（YYYY-MM形式）
        const reportMonth = `${month}-01`
        
        // 既存データを確認
        const { data: existingData } = await supabase
          .from('web_sales')
          .select('*')
          .eq('product_id', result.productId)
          .eq('report_month', reportMonth)
          .single()

        if (existingData) {
          // 既存データを更新（amazon_count列を使用）
          const { error: updateError } = await supabase
            .from('web_sales')
            .update({
              amazon_count: result.quantity,
              report_month: reportMonth,
              updated_at: new Date().toISOString()
            })
            .eq('product_id', result.productId)
            .eq('report_month', reportMonth)

          if (updateError) {
            console.error(`更新エラー (${result.productId}):`, updateError)
            errorCount++
          } else {
            console.log(`更新成功 (${result.productId}): ${result.quantity}`)
            successCount++
          }
        } else {
          // 新規データを挿入
          const { error: insertError } = await supabase
            .from('web_sales')
            .insert({
              product_id: result.productId,
              amazon_count: result.quantity,
              rakuten_count: 0,
              yahoo_count: 0,
              mercari_count: 0,
              base_count: 0,
              qoo10_count: 0,
              report_month: reportMonth,
              report_date: reportMonth,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })

          if (insertError) {
            console.error(`挿入エラー (${result.productId}):`, insertError)
            errorCount++
          } else {
            console.log(`挿入成功 (${result.productId}): ${result.quantity}`)
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
