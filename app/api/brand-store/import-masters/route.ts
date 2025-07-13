// /app/api/brand-store/import-masters/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const categoryFile = formData.get('categoryFile') as File | null
    const productFile = formData.get('productFile') as File | null
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    let categoryCount = 0
    let productCount = 0

    // カテゴリーマスターのインポート
    if (categoryFile) {
      const categoryText = await categoryFile.text()
      const categoryResult = Papa.parse(categoryText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true
      })

      if (categoryResult.errors.length > 0) {
        throw new Error('カテゴリーマスターCSVの解析に失敗しました')
      }

      // 既存データをクリア
      await supabase.from('category_master').delete().neq('category_id', 0)

      // カテゴリーデータを整形して挿入
      const categories = categoryResult.data.map((row: any) => ({
        category_id: row['カテゴリーID'],
        category_name: row['カテゴリー名'],
        category_short_name: row['カテゴリー名（略称）'],
        is_visible: row['表示/非表示']
      })).filter((cat: any) => cat.category_id)

      const { error: categoryError } = await supabase
        .from('category_master')
        .insert(categories)

      if (categoryError) {
        throw new Error(`カテゴリーマスターの保存に失敗: ${categoryError.message}`)
      }

      categoryCount = categories.length
    }

    // 商品マスターのインポート
    if (productFile) {
      const productText = await productFile.text()
      
      // 商品マスターは2行目からがデータなので、最初の行を除去
      const lines = productText.split('\n')
      const headerAndData = lines.slice(1).join('\n')
      
      const productResult = Papa.parse(headerAndData, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true
      })

      if (productResult.errors.length > 0) {
        throw new Error('商品マスターCSVの解析に失敗しました')
      }

      // 既存データをクリア
      await supabase.from('product_master').delete().neq('product_id', 0)

      // 商品データを整形して挿入
      const products = productResult.data
        .filter((row: any) => row['商品ID'] && typeof row['商品ID'] === 'number')
        .map((row: any) => ({
          product_id: row['商品ID'],
          product_name: row['【必須】商品名 ※49文字'] || row['商品名'],
          category_id: row['カテゴリーID'],
          price: row['【必須】価格 ※半角数字'] || row['価格'],
          barcode: row['バーコード']
        }))

      // バッチ処理（500件ずつ）
      const batchSize = 500
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize)
        const { error: productError } = await supabase
          .from('product_master')
          .insert(batch)

        if (productError) {
          throw new Error(`商品マスターの保存に失敗 (${i}-${i + batch.length}件目): ${productError.message}`)
        }
      }

      productCount = products.length
    }

    return NextResponse.json({
      success: true,
      message: 'マスターデータのインポートが完了しました',
      categoryCount,
      productCount
    })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'インポートに失敗しました'
    }, { status: 500 })
  }
}
