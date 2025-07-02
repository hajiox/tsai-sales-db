// /app/api/import/csv-confirm/route.ts ver.1
// 汎用CSV保存API（社内集計済みEXCEL取り込み用）

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ConfirmItem {
  csvTitle: string
  productId: string
  amazonCount: number
  rakutenCount: number
  yahooCount: number
  mercariCount: number
  baseCount: number
  qoo10Count: number
}

export async function POST(request: NextRequest) {
  try {
    console.log("CSV Confirm API called")
    
    const { items, month } = await request.json()

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'アイテムデータが無効です' }, { status: 400 })
    }

    if (!month) {
      return NextResponse.json({ error: '月が指定されていません' }, { status: 400 })
    }

    // 月の形式を YYYY-MM-DD に変換
    const reportMonth = `${month}-01`
    console.log(`保存対象月: ${reportMonth}`)

    let savedCount = 0
    let learnedCount = 0
    let totalQuantity = 0

    for (const item of items) {
      const {
        csvTitle,
        productId,
        amazonCount,
        rakutenCount,
        yahooCount,
        mercariCount,
        baseCount,
        qoo10Count
      } = item

      if (!productId) {
        console.warn(`商品ID未設定のためスキップ: ${csvTitle}`)
        continue
      }

      // 売上数量合計計算
      const itemTotal = amazonCount + rakutenCount + yahooCount + mercariCount + baseCount + qoo10Count
      totalQuantity += itemTotal

      // web_sales_summaryにUPSERT
      const { error: upsertError } = await supabase
        .from('web_sales_summary')
        .upsert({
          product_id: productId,
          report_month: reportMonth,
          amazon_count: amazonCount,
          rakuten_count: rakutenCount,
          yahoo_count: yahooCount,
          mercari_count: mercariCount,
          base_count: baseCount,
          qoo10_count: qoo10Count,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'product_id,report_month'
        })

      if (upsertError) {
        console.error(`売上データ保存エラー (${productId}):`, upsertError)
        continue
      }

      savedCount++

      // CSV学習データの保存
      // 既存の学習データをチェック
      const { data: existingMapping } = await supabase
        .from('csv_product_mapping')
        .select('csv_title')
        .eq('csv_title', csvTitle)
        .single()

      if (!existingMapping) {
        // 新規学習データとして保存
        const { error: learningError } = await supabase
          .from('csv_product_mapping')
          .insert({
            csv_title: csvTitle,
            product_id: productId
          })

        if (learningError) {
          console.error(`CSV学習データ保存エラー (${csvTitle}):`, learningError)
        } else {
          learnedCount++
          console.log(`新規CSV学習データ保存: ${csvTitle} -> ${productId}`)
        }
      }
    }

    console.log(`CSV保存完了: ${savedCount}件保存, ${learnedCount}件学習, 総数量=${totalQuantity}`)

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
      error: 'CSV保存中にエラーが発生しました',
      details: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 })
  }
}
