// /app/api/import/csv-confirm/route.ts ver.4
// 汎用CSV保存API（デバッグ強化版）

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
    console.log("=== CSV Confirm API開始 (デバッグ強化版) ===")
    
    const { items, month } = await request.json()
    console.log(`受信データ - items数: ${items?.length}, month: ${month}`)

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

      // 🎯 デバッグ: 受信データの詳細ログ
      console.log(`\n--- 商品処理開始 ---`)
      console.log(`商品名: ${csvTitle}`)
      console.log(`商品ID: ${productId}`)
      console.log(`受信数値詳細:`)
      console.log(`  Amazon: ${amazonCount} (型: ${typeof amazonCount})`)
      console.log(`  楽天: ${rakutenCount} (型: ${typeof rakutenCount})`)
      console.log(`  Yahoo: ${yahooCount} (型: ${typeof yahooCount})`)
      console.log(`  メルカリ: ${mercariCount} (型: ${typeof mercariCount})`)
      console.log(`  BASE: ${baseCount} (型: ${typeof baseCount})`)
      console.log(`  Qoo10: ${qoo10Count} (型: ${typeof qoo10Count})`)

      if (!productId) {
        console.warn(`商品ID未設定のためスキップ: ${csvTitle}`)
        continue
      }

      // 🎯 数値型チェックと変換
      const safeAmazonCount = Number(amazonCount) || 0
      const safeRakutenCount = Number(rakutenCount) || 0
      const safeYahooCount = Number(yahooCount) || 0
      const safeMercariCount = Number(mercariCount) || 0
      const safeBaseCount = Number(baseCount) || 0
      const safeQoo10Count = Number(qoo10Count) || 0

      console.log(`変換後数値:`)
      console.log(`  Amazon: ${safeAmazonCount}`)
      console.log(`  楽天: ${safeRakutenCount}`)
      console.log(`  Yahoo: ${safeYahooCount}`)
      console.log(`  メルカリ: ${safeMercariCount}`)
      console.log(`  BASE: ${safeBaseCount}`)
      console.log(`  Qoo10: ${safeQoo10Count}`)

      // 売上数量合計計算
      const itemTotal = safeAmazonCount + safeRakutenCount + safeYahooCount + safeMercariCount + safeBaseCount + safeQoo10Count
      totalQuantity += itemTotal

      console.log(`保存準備: ${csvTitle} -> ${productId} (Amazon:${safeAmazonCount}, 楽天:${safeRakutenCount}, Yahoo:${safeYahooCount}, メルカリ:${safeMercariCount}, BASE:${safeBaseCount}, Qoo10:${safeQoo10Count})`)

      // 🎯 UPSERT前のデータ確認
      const upsertData = {
        product_id: productId,
        report_month: reportMonth,
        amazon_count: safeAmazonCount,
        rakuten_count: safeRakutenCount,
        yahoo_count: safeYahooCount,
        mercari_count: safeMercariCount,
        base_count: safeBaseCount,
        qoo10_count: safeQoo10Count,
        report_date: reportMonth
      }
      
      console.log(`UPSERT実行データ:`, JSON.stringify(upsertData, null, 2))

      // web_sales_summaryにUPSERT
      const { data: upsertResult, error: upsertError } = await supabase
        .from('web_sales_summary')
        .upsert(upsertData, {
          onConflict: 'product_id,report_month'
        })
        .select()

      if (upsertError) {
        console.error(`❌ 売上データ保存エラー (${productId}):`, upsertError)
        console.error('エラー詳細:', JSON.stringify(upsertError, null, 2))
        continue
      }

      console.log(`✅ UPSERT成功:`, upsertResult)
      savedCount++
      console.log(`保存成功: ${csvTitle} -> ${productId} (${itemTotal}個)`)

      // 🎯 保存後のデータ確認
      const { data: verifyData, error: verifyError } = await supabase
        .from('web_sales_summary')
        .select('amazon_count, rakuten_count, yahoo_count, mercari_count, base_count, qoo10_count')
        .eq('product_id', productId)
        .eq('report_month', reportMonth)
        .single()

      if (!verifyError && verifyData) {
        console.log(`🔍 保存後確認データ:`, verifyData)
        if (verifyData.amazon_count !== safeAmazonCount) {
          console.error(`⚠️ Amazon数量不一致! 期待値:${safeAmazonCount}, 実際:${verifyData.amazon_count}`)
        }
      }

      // CSV学習データの保存
      const { data: existingMapping } = await supabase
        .from('csv_product_mapping')
        .select('csv_title')
        .eq('csv_title', csvTitle)
        .single()

      if (!existingMapping) {
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

    console.log(`=== CSV保存完了 ===`)
    console.log(`保存件数: ${savedCount}件`)
    console.log(`学習件数: ${learnedCount}件`)
    console.log(`総数量: ${totalQuantity}`)

    return NextResponse.json({
      success: true,
      message: `${month}のCSVデータを保存しました`,
      savedCount,
      learnedCount,
      totalQuantity,
      month: month
    })

  } catch (error) {
    console.error('❌ CSV Confirm API エラー:', error)
    return NextResponse.json({ 
      error: 'CSV保存中にエラーが発生しました',
      details: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 })
  }
}
