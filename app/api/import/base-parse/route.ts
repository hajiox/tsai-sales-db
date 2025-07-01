// /app/api/import/base-parse/route.ts
// ver.1 (楽天APIからの完全移植版 - BASE対応)

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { findBestMatchSimplified } from '@/lib/csvHelpers'

export async function POST(request: NextRequest) {
  try {
    console.log('🏪 BASE PARSE API ver.1 - 処理開始')

    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ 
        success: false, 
        error: 'ファイルがアップロードされていません' 
      }, { status: 400 })
    }

    console.log('📁 ファイル情報:', { 
      name: file.name, 
      size: file.size, 
      type: file.type 
    })

    // ファイル内容を読み取り
    const text = await file.text()
    console.log('📄 ファイル読み取り完了')

    // CSVデータを行に分割
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    console.log('📋 行数確認:', { 
      totalLines: lines.length, 
      dataLines: lines.length - 1 
    })

    if (lines.length <= 1) {
      return NextResponse.json({ 
        success: false, 
        error: 'CSVファイルにデータが含まれていません' 
      }, { status: 400 })
    }

    // 商品マスターを取得
    console.log('🔍 商品マスター取得開始')
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')

    if (productsError) {
      console.error('🚨 商品マスター取得エラー:', productsError)
      return NextResponse.json({ 
        success: false, 
        error: '商品マスターの取得に失敗しました' 
      }, { status: 500 })
    }

    console.log('📦 商品マスター件数:', products?.length || 0)

    // BASE学習データを取得
    console.log('🧠 BASE学習データ取得開始')
    const { data: learningData, error: learningError } = await supabase
      .from('base_product_mapping')
      .select('base_title, product_id')

    if (learningError) {
      console.error('🚨 BASE学習データ取得エラー:', learningError)
      return NextResponse.json({ 
        success: false, 
        error: 'BASE学習データの取得に失敗しました' 
      }, { status: 500 })
    }

    console.log('🧠 BASE学習データ件数:', learningData?.length || 0)

    // 学習データをマップに変換
    const learningMap = new Map<string, string>()
    learningData?.forEach(item => {
      learningMap.set(item.base_title, item.product_id)
    })

    // CSVデータを解析
    const csvData: Array<{
      productName: string
      quantity: number
      rawLine: string
    }> = []

    let totalQuantity = 0

    // データ行を処理（ヘッダー行をスキップ）
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      // CSV行を列に分割（ダブルクォート考慮）
      const columns = line.split(',').map(col => 
        col.replace(/^"(.*)"$/, '$1').trim()
      )

      // BASE CSVの構造：商品名=18列目（0ベース17）、数量=22列目（0ベース21）
      const productName = columns[17]?.trim()
      const quantityStr = columns[21]?.trim()
      const quantity = quantityStr ? parseInt(quantityStr, 10) : 0

      if (productName && productName.length > 0 && quantity > 0) {
        csvData.push({
          productName,
          quantity,
          rawLine: line
        })
        totalQuantity += quantity
      }
    }

    console.log('📊 CSV解析結果:', { 
      csvDataLength: csvData.length, 
      totalQuantity 
    })

    // マッチング処理
    const matchedItems: Array<{
      csvProductName: string
      quantity: number
      matchedProduct: any
      confidence: number
      isLearned: boolean
    }> = []

    const unmatchedItems: Array<{
      csvProductName: string
      quantity: number
    }> = []

    for (const item of csvData) {
      let matchedProduct = null
      let confidence = 0
      let isLearned = false

      // 1. 学習データから完全一致を探す
      if (learningMap.has(item.productName)) {
        const productId = learningMap.get(item.productName)!
        matchedProduct = products?.find(p => p.id === productId)
        confidence = 100
        isLearned = true
        console.log('🧠 学習データ一致:', { 
          csvName: item.productName, 
          productId, 
          productName: matchedProduct?.name 
        })
      }

      // 2. 学習データにない場合は類似度マッチング
      if (!matchedProduct && products) {
        const bestMatch = findBestMatchSimplified(item.productName, products, 'base')
        if (bestMatch && bestMatch.confidence >= 70) {
          matchedProduct = bestMatch.product
          confidence = bestMatch.confidence
        }
      }

      if (matchedProduct) {
        matchedItems.push({
          csvProductName: item.productName,
          quantity: item.quantity,
          matchedProduct,
          confidence,
          isLearned
        })
      } else {
        unmatchedItems.push({
          csvProductName: item.productName,
          quantity: item.quantity
        })
      }
    }

    console.log('🎯 マッチング結果:', { 
      matchedCount: matchedItems.length, 
      unmatchedCount: unmatchedItems.length 
    })

    // 月を取得（ファイル名から推測）
    let month = '2025-07'
    const monthMatch = file.name.match(/(\d{4})\.(\d{1,2})/)
    if (monthMatch) {
      const year = monthMatch[1]
      const monthNum = monthMatch[2].padStart(2, '0')
      month = `${year}-${monthNum}`
    }

    return NextResponse.json({
      success: true,
      data: {
        matchedItems,
        unmatchedItems,
        totalQuantity,
        month
      },
      summary: {
        totalItems: csvData.length,
        matchedCount: matchedItems.length,
        unmatchedCount: unmatchedItems.length,
        totalQuantity
      }
    })

  } catch (error) {
    console.error('🚨 BASE PARSE API エラー:', error)
    return NextResponse.json({
      success: false,
      error: 'CSVファイルの処理中にエラーが発生しました: ' + 
             (error instanceof Error ? error.message : '不明なエラー')
    }, { status: 500 })
  }
}
