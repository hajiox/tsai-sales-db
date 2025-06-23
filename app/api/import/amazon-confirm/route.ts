// /app/api/import/amazon-confirm/route.ts ver.4 (デバッグ強化版)
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
    console.log('最初のresult例:', results[0])

    let successCount = 0
    let errorCount = 0
    const errors = []

    for (const result of results) {
      try {
        console.log(`処理中: product_id=${result.productId}, quantity=${result.quantity}`)
        
        // web_salesテーブルの構造に合わせて保存
        const insertData = {
          product_id: result.productId,
          amazon_count: result.quantity,
          rakuten_count: null,
          yahoo_count: null,
          mercari_count: null,
          base_count: null,
          qoo10_count: null,
          report_month: '2025-06-01',
          report_date: '2025-06-01',
          created_at: new Date().toISOString()
        }

        console.log('挿入データ:', insertData)

        // upsert処理
        const { data, error } = await supabase
          .from('web_sales')
          .upsert(insertData, {
            onConflict: 'product_id,report_month'
          })
          .select()

        if (error) {
          console.error(`upsertエラー (${result.productId}):`, error)
          errors.push(`${result.productId}: ${error.message}`)
          errorCount++
        } else {
          console.log(`upsert成功 (${result.productId}):`, data)
          successCount++
        }
      } catch (itemError) {
        console.error(`処理エラー (${result.productId}):`, itemError)
        errors.push(`${result.productId}: ${itemError.message}`)
        errorCount++
      }
    }

    console.log(`Amazon確定処理完了: 成功${successCount}件, エラー${errorCount}件`)
    console.log('エラー詳細:', errors)

    return NextResponse.json({
      message: `Amazon データの更新が完了しました (成功: ${successCount}件, エラー: ${errorCount}件)`,
      success: successCount > 0,
      successCount,
      errorCount,
      totalCount: results.length,
      errors: errors
    })

  } catch (error) {
    console.error('Amazon確定API エラー:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました: ' + error.message },
      { status: 500 }
    )
  }
}
