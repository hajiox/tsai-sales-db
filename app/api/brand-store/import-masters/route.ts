// /app/api/brand-store/import-masters/route.ts ver.5 (累積管理・履歴対応版)
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import Papa from 'papaparse'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const categoryFile = formData.get('categoryMaster') as File
    const productFile = formData.get('productMaster') as File
    
    const supabase = createRouteHandlerClient({ cookies })

    // カテゴリーマスターの処理
    if (categoryFile) {
      const categoryText = await categoryFile.text()
      const categoryResult = Papa.parse(categoryText, {
        header: true,
        skipEmptyLines: true
      })

      // 重複を除外（Map使用）
      const categoryMap = new Map()
      categoryResult.data.forEach((row: any) => {
        if (row['カテゴリーID']) {
          categoryMap.set(row['カテゴリーID'], {
            category_id: parseInt(row['カテゴリーID']),
            category_name: row['カテゴリー名'] || '',
            category_short_name: row['カテゴリー名（略称）'] || '',
            is_visible: row['表示/非表示'] || '1'
          })
        }
      })

      // 既存データを取得
      const { data: existingCategories } = await supabase
        .from('category_master')
        .select('*')

      const existingMap = new Map(existingCategories?.map(c => [c.category_id, c]) || [])

      // 更新・追加・履歴記録
      for (const [categoryId, newData] of categoryMap) {
        const existing = existingMap.get(newData.category_id)
        
        if (existing) {
          // 名称変更があった場合は履歴を記録
          if (existing.category_name !== newData.category_name) {
            await supabase.from('category_master_history').insert({
              category_id: newData.category_id,
              old_category_name: existing.category_name,
              new_category_name: newData.category_name
            })
          }
          
          // 既存レコードを更新
          await supabase
            .from('category_master')
            .update({
              ...newData,
              updated_at: new Date().toISOString()
            })
            .eq('category_id', newData.category_id)
        } else {
          // 新規追加
          await supabase.from('category_master').insert(newData)
        }
      }
    }

    // 商品マスターの処理
    if (productFile) {
      const productText = await productFile.text()
      const lines = productText.split('\n').filter(line => line.trim())
      
      if (lines.length < 2) {
        throw new Error('商品マスターファイルにデータがありません')
      }

      // 1行目はバージョン情報なのでスキップ
      const productResult = Papa.parse(lines.slice(1).join('\n'), {
        header: false,
        skipEmptyLines: true
      })

      // 重複を除外（Map使用）
      const productMap = new Map()
      productResult.data.forEach((row: any) => {
        if (row[0]) {
          productMap.set(row[0], {
            product_id: parseInt(row[0]),
            product_name: row[1] || '',
            category_id: row[2] ? parseInt(row[2]) : null,
            price: row[3] ? parseInt(row[3]) : null,
            barcode: row[4] || null
          })
        }
      })

      // 既存データを取得
      const { data: existingProducts } = await supabase
        .from('product_master')
        .select('*')

      const existingProdMap = new Map(existingProducts?.map(p => [p.product_id, p]) || [])

      // 更新・追加・履歴記録
      for (const [productId, newData] of productMap) {
        const existing = existingProdMap.get(newData.product_id)
        
        if (existing) {
          // 変更があった場合は履歴を記録
          if (existing.product_name !== newData.product_name || 
              existing.category_id !== newData.category_id) {
            await supabase.from('product_master_history').insert({
              product_id: newData.product_id,
              old_product_name: existing.product_name,
              new_product_name: newData.product_name,
              old_category_id: existing.category_id,
              new_category_id: newData.category_id
            })
          }
          
          // 既存レコードを更新
          await supabase
            .from('product_master')
            .update({
              ...newData,
              updated_at: new Date().toISOString()
            })
            .eq('product_id', newData.product_id)
        } else {
          // 新規追加
          await supabase.from('product_master').insert(newData)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'インポートに失敗しました' 
    }, { status: 500 })
  }
}
