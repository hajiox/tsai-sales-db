// /app/api/import/csv-confirm/route.ts ver.5
// 汎用CSV保存API（超詳細デバッグ版）

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
    console.log("=== CSV Confirm API開始 (超詳細デバッグ版) ===")
    
    const body = await request.json()
    console.log("受信したbodyの型:", typeof body)
    console.log("bodyのキー:", Object.keys(body))
    
    const { items, month } = body
    console.log(`month: ${month}`)
    console.log(`itemsの型: ${typeof items}`)
    console.log(`items.length: ${items?.length}`)

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

    // 特定商品のデバッグ用フラグ
    const debugTargetName = "訳あり";

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      
      // 特定商品の詳細デバッグ
      if (item.csvTitle && item.csvTitle.includes(debugTargetName)) {
        console.log(`\n🎯🎯🎯 === 特定商品（${debugTargetName}）の詳細デバッグ開始 === 🎯🎯🎯`)
        console.log(`インデックス: ${idx}`)
        console.log(`受信したitemオブジェクト（JSON文字列化）:`)
        console.log(JSON.stringify(item, null, 2))
        
        console.log(`\n各プロパティの詳細:`)
        Object.entries(item).forEach(([key, value]) => {
          console.log(`  ${key}: ${value} (型: ${typeof value})`)
        })
      }

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

      // 通常のデバッグログ
      if (item.csvTitle && item.csvTitle.includes(debugTargetName)) {
        console.log(`\n--- 🎯 特定商品処理開始 ---`)
        console.log(`商品名: ${csvTitle}`)
        console.log(`商品ID: ${productId}`)
        console.log(`受信した生の値:`)
        console.log(`  amazonCount: ${amazonCount} (型: ${typeof amazonCount})`)
        console.log(`  rakutenCount: ${rakutenCount} (型: ${typeof rakutenCount})`)
        console.log(`  yahooCount: ${yahooCount} (型: ${typeof yahooCount})`)
        console.log(`  mercariCount: ${mercariCount} (型: ${typeof mercariCount})`)
        console.log(`  baseCount: ${baseCount} (型: ${typeof baseCount})`)
        console.log(`  qoo10Count: ${qoo10Count} (型: ${typeof qoo10Count})`)
      }

      if (!productId) {
        console.warn(`商品ID未設定のためスキップ: ${csvTitle}`)
        continue
      }

      // 🎯 数値型変換（詳細ログ付き）
      const safeAmazonCount = Number(amazonCount) || 0
      const safeRakutenCount = Number(rakutenCount) || 0
      const safeYahooCount = Number(yahooCount) || 0
      const safeMercariCount = Number(mercariCount) || 0
      const safeBaseCount = Number(baseCount) || 0
      const safeQoo10Count = Number(qoo10Count) || 0

      if (item.csvTitle && item.csvTitle.includes(debugTargetName)) {
        console.log(`\n変換後の値:`)
        console.log(`  safeAmazonCount: ${safeAmazonCount}`)
        console.log(`  safeRakutenCount: ${safeRakutenCount}`)
        console.log(`  safeYahooCount: ${safeYahooCount}`)
        console.log(`  safeMercariCount: ${safeMercariCount}`)
        console.log(`  safeBaseCount: ${safeBaseCount}`)
        console.log(`  safeQoo10Count: ${safeQoo10Count}`)
      }

      // 売上数量合計計算
      const itemTotal = safeAmazonCount + safeRakutenCount + safeYahooCount + safeMercariCount + safeBaseCount + safeQoo10Count
      totalQuantity += itemTotal

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
      
      if (item.csvTitle && item.csvTitle.includes(debugTargetName)) {
        console.log(`\n🎯 UPSERT実行前のデータ:`)
        console.log(JSON.stringify(upsertData, null, 2))
      }

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

      if (item.csvTitle && item.csvTitle.includes(debugTargetName)) {
        console.log(`\n🎯 UPSERT結果:`)
        console.log(JSON.stringify(upsertResult, null, 2))
      }

      savedCount++

      // 🎯 保存直後のデータ確認（特定商品のみ）
      if (item.csvTitle && item.csvTitle.includes(debugTargetName)) {
        const { data: verifyData, error: verifyError } = await supabase
          .from('web_sales_summary')
          .select('*')
          .eq('product_id', productId)
          .eq('report_month', reportMonth)
          .single()

        if (!verifyError && verifyData) {
          console.log(`\n🎯🔍 保存直後の検証データ（全列）:`)
          console.log(JSON.stringify(verifyData, null, 2))
          
          // 値の比較
          console.log(`\n🎯 値の比較:`)
          console.log(`  Amazon - 期待値:${safeAmazonCount}, 実際:${verifyData.amazon_count}, 一致:${verifyData.amazon_count === safeAmazonCount}`)
          console.log(`  楽天 - 期待値:${safeRakutenCount}, 実際:${verifyData.rakuten_count}, 一致:${verifyData.rakuten_count === safeRakutenCount}`)
          console.log(`  Yahoo - 期待値:${safeYahooCount}, 実際:${verifyData.yahoo_count}, 一致:${verifyData.yahoo_count === safeYahooCount}`)
          console.log(`  メルカリ - 期待値:${safeMercariCount}, 実際:${verifyData.mercari_count}, 一致:${verifyData.mercari_count === safeMercariCount}`)
          console.log(`  BASE - 期待値:${safeBaseCount}, 実際:${verifyData.base_count}, 一致:${verifyData.base_count === safeBaseCount}`)
          console.log(`  Qoo10 - 期待値:${safeQoo10Count}, 実際:${verifyData.qoo10_count}, 一致:${verifyData.qoo10_count === safeQoo10Count}`)
        } else if (verifyError) {
          console.error(`🎯 検証エラー:`, verifyError)
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
        }
      }
    }

    console.log(`\n=== CSV保存完了 ===`)
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
