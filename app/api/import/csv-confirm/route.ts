// /app/api/import/csv-confirm/route.ts ver.4 (単価スナップショット対応)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getBulkProductUnitPrices } from '@/lib/unitPriceHelper'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
)

interface ConfirmItem {
  csvTitle: string
  matchedProduct?: {
    id: string
    name: string
  }
  amazonCount: number
  rakutenCount: number
  yahooCount: number
  mercariCount: number
  baseCount: number
  qoo10Count: number
}

export async function POST(request: NextRequest) {
  try {
    console.log("=== CSV Confirm API開始 (uuid対応版 ver.3) ===")

    const body = await request.json()
    const { items, month } = body

    // デバッグ: 受信したデータ構造を確認
    console.log("受信したbody:", JSON.stringify(body, null, 2))

    console.log(`受信データ - items数: ${items?.length}, month: ${month}`)

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({
        success: false,
        error: 'アイテムデータが無効です'
      }, { status: 400 })
    }

    if (!month) {
      return NextResponse.json({
        success: false,
        error: '月が指定されていません'
      }, { status: 400 })
    }

    // 月の形式をYYYY-MM-DD に変換
    const reportMonth = `${month}-01`
    console.log(`保存対象月: ${reportMonth}`)

    let successCount = 0
    let errorCount = 0
    let learnedMappings = 0
    let skippedCount = 0

    // 商品IDごとに数量を集約
    const aggregatedData = new Map<string, {
      productId: string
      productName: string
      csvTitle: string
      amazonCount: number
      rakutenCount: number
      yahooCount: number
      mercariCount: number
      baseCount: number
      qoo10Count: number
    }>()

    // データ集約処理
    for (const item of items) {
      // フロントエンドからのデータ構造に対応
      const productId = item.matchedProduct?.id || item.productId
      const productName = item.matchedProduct?.name || item.productName

      if (!productId) {
        console.log(`❌ スキップ: 商品IDなし - "${item.csvTitle}"`)
        skippedCount++
        continue
      }
      const existing = aggregatedData.get(productId)

      if (existing) {
        // 既存データに数量を加算
        existing.amazonCount += Number(item.amazonCount) || 0
        existing.rakutenCount += Number(item.rakutenCount) || 0
        existing.yahooCount += Number(item.yahooCount) || 0
        existing.mercariCount += Number(item.mercariCount) || 0
        existing.baseCount += Number(item.baseCount) || 0
        existing.qoo10Count += Number(item.qoo10Count) || 0
      } else {
        // 新規データ追加
        aggregatedData.set(productId, {
          productId,
          productName: productName || '商品名不明',
          csvTitle: item.csvTitle,
          amazonCount: Number(item.amazonCount) || 0,
          rakutenCount: Number(item.rakutenCount) || 0,
          yahooCount: Number(item.yahooCount) || 0,
          mercariCount: Number(item.mercariCount) || 0,
          baseCount: Number(item.baseCount) || 0,
          qoo10Count: Number(item.qoo10Count) || 0
        })
      }
    }

    console.log(`📊 集約結果: ${aggregatedData.size}個の商品`)

    // 新規挿入時にunit_priceを保存するため、商品価格を一括取得
    const productIdList = Array.from(aggregatedData.keys())
    const unitPriceMap = await getBulkProductUnitPrices(supabase, productIdList)

    // データベース保存処理
    for (const [productId, data] of aggregatedData) {
      try {
        console.log(`\n--- 商品処理: ${data.productName} (${productId}) ---`)

        // 既存データ確認
        const { data: existingData } = await supabase
          .from('web_sales_summary')
          .select('*')
          .eq('product_id', productId)
          .eq('report_month', reportMonth)
          .single()

        const upsertData = {
          product_id: productId,
          report_month: reportMonth,
          amazon_count: data.amazonCount,
          rakuten_count: data.rakutenCount,
          yahoo_count: data.yahooCount,
          mercari_count: data.mercariCount,
          base_count: data.baseCount,
          qoo10_count: data.qoo10Count,
          report_date: reportMonth,
          ...(existingData ? {} : {
            unit_price: unitPriceMap.get(productId)?.unit_price || 0,
            unit_profit_rate: unitPriceMap.get(productId)?.unit_profit_rate || 0,
          })
        }

        console.log(`💾 UPSERT実行:`, JSON.stringify(upsertData, null, 2))

        // web_sales_summaryにUPSERT（詳細ログ付き）
        const { data: upsertResult, error: upsertError } = await supabase
          .from('web_sales_summary')
          .upsert(upsertData, {
            onConflict: 'product_id,report_month'
          })
          .select()

        if (upsertError) {
          console.error(`❌ 売上データ保存エラー (${productId}):`, upsertError)
          console.error(`❌ エラー詳細:`, JSON.stringify(upsertError, null, 2))
          errorCount++
          continue
        }

        console.log(`📊 UPSERT結果:`, JSON.stringify(upsertResult, null, 2))

        // 実際に保存されたかを即座に確認
        const { data: verifyData, error: verifyError } = await supabase
          .from('web_sales_summary')
          .select('*')
          .eq('product_id', productId)
          .eq('report_month', reportMonth)
          .single()

        if (verifyError) {
          console.error(`❌ 保存確認エラー:`, verifyError)
        } else {
          console.log(`🔍 保存確認:`, JSON.stringify(verifyData, null, 2))
        }

        console.log(`✅ 売上データ保存成功: ${data.productName}`)
        successCount++

        // CSV学習データの保存
        const { data: existingMapping } = await supabase
          .from('csv_product_mapping')
          .select('csv_title')
          .eq('csv_title', data.csvTitle)
          .single()

        if (!existingMapping) {
          const { error: learningError } = await supabase
            .from('csv_product_mapping')
            .upsert({
              csv_title: data.csvTitle,
              product_id: productId
            })

          if (learningError) {
            console.error(`CSV学習データ保存エラー (${data.csvTitle}):`, learningError)
          } else {
            console.log(`📚 学習データ保存: "${data.csvTitle}" -> ${data.productName}`)
            learnedMappings++
          }
        }

      } catch (itemError) {
        console.error(`商品処理エラー (${productId}):`, itemError)
        errorCount++
      }
    }

    const totalCount = successCount + errorCount + skippedCount

    console.log(`\n=== CSV Confirm API完了 ===`)
    console.log(`✅ 成功: ${successCount}件`)
    console.log(`❌ エラー: ${errorCount}件`)
    console.log(`⏭️ スキップ: ${skippedCount}件`)
    console.log(`📚 学習: ${learnedMappings}件`)
    console.log(`📊 合計: ${totalCount}件`)

    return NextResponse.json({
      success: true,
      message: `${month}月のCSVデータを正常に保存しました`,
      successCount,
      errorCount,
      totalCount,
      learnedMappings,
      month
    })

  } catch (error) {
    console.error('❌ CSV Confirm API エラー:', error)
    return NextResponse.json({
      success: false,
      error: 'CSV保存中にエラーが発生しました',
      details: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 })
  }
}
