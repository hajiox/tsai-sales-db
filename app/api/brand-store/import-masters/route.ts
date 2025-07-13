// /app/api/brand-store/import-masters/route.ts ver.3
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
        console.error('CSV Parse Error (Category):', categoryResult.errors);
        throw new Error('カテゴリーマスターCSVの解析に失敗しました。ファイル形式を確認してください。')
      }

      // 既存データをクリア
      await supabase.from('category_master').delete().neq('category_id', 0)

      const categories = categoryResult.data.map((row: any) => ({
        category_id: row['カテゴリーID'],
        category_name: row['カテゴリー名'],
        category_short_name: row['カテゴリー名（略称）'],
        is_visible: row['表示/非表示']
      })).filter((cat: any) => cat.category_id != null);

      const { error: categoryError } = await supabase
        .from('category_master')
        .insert(categories)

      if (categoryError) {
        console.error('Supabase Category Insert Error:', categoryError);
        throw new Error(`カテゴリーマスターの保存に失敗: ${categoryError.message || 'データベースエラーが発生しました。'}`)
      }

      categoryCount = categories.length
    }

    // 商品マスターのインポート
    if (productFile) {
      const productText = await productFile.text()
      const lines = productText.split('\n')
      // 1行目のバージョン情報を考慮
      const dataLines = lines.length > 1 && lines[0].startsWith('v') ? lines.slice(1) : lines;
      const headerAndData = dataLines.join('\n');
      
      const productResult = Papa.parse(headerAndData, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        transformHeader: (header) => header.trim()
      })

      if (productResult.errors.length > 0) {
        console.error('CSV Parse Error (Product):', productResult.errors);
        throw new Error('商品マスターCSVの解析に失敗しました。ファイル形式を確認してください。')
      }

      // 既存データをクリア
      await supabase.from('product_master').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      // 重複を除外するためにMapを使用（最後に出現したものを保持）
      const productMap = new Map<number, any>()
      
      productResult.data.forEach((row: any) => {
        const productId = row['商品ID']
        if (productId != null && String(productId).trim() !== '') {
          productMap.set(productId, {
            product_id: productId,
            product_name: row['【必須】商品名 ※49文字'] || row['商品名'],
            category_id: row['カテゴリーID'],
            price: row['【必須】価格 ※半角数字'] || row['価格'],
            barcode: row['バーコード']
          })
        }
      })

      const products = Array.from(productMap.values())

      if (products.length > 0) {
        const batchSize = 500
        for (let i = 0; i < products.length; i += batchSize) {
          const batch = products.slice(i, i + batchSize)
          const { error: productError } = await supabase
            .from('product_master')
            .insert(batch)

          if (productError) {
            console.error('Supabase Product Insert Error:', productError);
            throw new Error(`商品マスターの保存に失敗 (${i+1}件目~): ${productError.message || 'データベースエラーが発生しました。'}`)
          }
        }
      }

      productCount = products.length
      
      // 重複があった場合は警告メッセージを追加
      const duplicateCount = productResult.data.filter((row: any) => 
        row['商品ID'] != null && String(row['商品ID']).trim() !== ''
      ).length - products.length
      
      if (duplicateCount > 0) {
        console.log(`${duplicateCount}件の重複した商品IDがありました（最後のものを保持）`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'マスターデータのインポートが完了しました',
      categoryCount,
      productCount
    })
  } catch (error) {
    console.error('Import API Error:', error)
    return NextResponse.json({ 
      success: false,
      error: error instanceof Error ? error.message : 'サーバー側で予期せぬエラーが発生しました。'
    }, { status: 500 })
  }
}
