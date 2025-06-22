// /app/api/import/amazon-confirm/route.ts ver.1
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export const dynamic = 'force-dynamic'

interface AmazonImportResult {
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matched: boolean
}

export async function POST(request: NextRequest) {
  try {
    console.log('Amazon CSV確定処理開始')

    const body = await request.json()
    const { results, month } = body

    if (!results || !Array.isArray(results)) {
      return NextResponse.json({ error: '処理データが不正です' }, { status: 400 })
    }

    if (!month) {
      return NextResponse.json({ error: '対象月が指定されていません' }, { status: 400 })
    }

    console.log('処理対象:', {
      month,
      resultCount: results.length
    })

    // 月の形式を調整 (YYYY-MM → YYYY-MM-01)
    const reportMonth = month.includes('-01') ? month : `${month}-01`

    // データベース更新処理
    let updateCount = 0
    let errorCount = 0

    for (const result of results as AmazonImportResult[]) {
      if (!result.productId || result.quantity <= 0) {
        console.log('スキップ:', result)
        continue
      }

      try {
        // 既存データを確認
        const { data: existingData, error: selectError } = await supabase
          .from('web_sales_summary')
          .select('amazon_count')
          .eq('product_id', result.productId)
          .eq('report_month', reportMonth)
          .single()

        if (selectError && selectError.code !== 'PGRST116') {
          console.error('既存データ確認エラー:', selectError)
          errorCount++
          continue
        }

        // upsert実行
        const { error: upsertError } = await supabase
          .from('web_sales_summary')
          .upsert({
            product_id: result.productId,
            report_month: reportMonth,
            amazon_count: result.quantity,
            // 他の列は既存値を保持するため、明示的に指定しない
          }, {
            onConflict: 'product_id,report_month',
            ignoreDuplicates: false
          })

        if (upsertError) {
          console.error('Upsert error for product:', result.productId, upsertError)
          errorCount++
        } else {
          updateCount++
          console.log(`更新成功: ${result.productName} → ${result.quantity}個`)
        }
      } catch (updateError) {
        console.error('個別更新エラー:', updateError)
        errorCount++
      }
    }

    console.log('更新完了:', {
      updateCount,
      errorCount,
      totalAttempts: results.length
    })

    const totalQuantity = results.reduce((sum: number, r: AmazonImportResult) => sum + r.quantity, 0)

    return NextResponse.json({
      message: `Amazon データを正常に更新しました。${updateCount}件の商品を処理しました。`,
      summary: {
        updatedRecords: updateCount,
        errorCount,
        totalQuantity,
        targetMonth: month
      }
    })

  } catch (error) {
    console.error('Amazon CSV確定処理エラー:', error)
    return NextResponse.json({ 
      error: '確定処理中にエラーが発生しました: ' + (error as Error).message 
    }, { status: 500 })
  }
}
