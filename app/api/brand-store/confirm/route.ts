// /app/api/brand-store/confirm/route.ts ver.3 (Next.js 15対応版)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set") })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set") })()
)

export async function POST(request: NextRequest) {
  try {
    const { data, selectedYear, selectedMonth } = await request.json()
    
    if (!data || !Array.isArray(data)) {
      return NextResponse.json({ error: 'データが不正です' }, { status: 400 })
    }

    const reportMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`

    // 既存の売上データを削除（月次上書き）
    const { error: deleteError } = await supabase
      .from('brand_store_sales')
      .delete()
      .eq('report_month', reportMonth)

    if (deleteError) throw deleteError

    // ★ 新商品の自動マスター登録処理
    const { data: existingProducts } = await supabase
      .from('product_master')
      .select('product_id, product_name')

    const existingProductIds = new Set(existingProducts?.map(p => p.product_id) || [])
    const existingProductNames = new Set(existingProducts?.map(p => p.product_name) || [])

    // カテゴリーマスターも取得して自動登録に対応
    const { data: existingCategories } = await supabase
      .from('category_master')
      .select('category_id, category_name')

    const categoryNameToIdMap = new Map(existingCategories?.map(c => [c.category_name, c.category_id]) || [])
    const existingCategoryNames = new Set(existingCategories?.map(c => c.category_name) || [])

    // 新商品と新カテゴリーを検出
    const newProducts: any[] = []
    const newCategories = new Set<string>()
    
    for (const item of data) {
      // 新カテゴリーの検出
      if (item.category && !existingCategoryNames.has(item.category)) {
        newCategories.add(item.category)
      }

      // 商品IDがあり、マスターに存在しない場合
      if (item.productId && !existingProductIds.has(item.productId)) {
        newProducts.push({
          product_id: item.productId,
          product_name: item.productName,
          category_id: item.category ? categoryNameToIdMap.get(item.category) || null : null,
          price: null,
          barcode: item.barcode
        })
      } 
      // 商品IDがないが、商品名が新規の場合
      else if (!item.productId && !existingProductNames.has(item.productName)) {
        // 仮の商品IDを生成（負の値を使用して既存IDと重複を避ける）
        const tempProductId = -1 * (Date.now() + Math.floor(Math.random() * 1000))
        newProducts.push({
          product_id: tempProductId,
          product_name: item.productName,
          category_id: item.category ? categoryNameToIdMap.get(item.category) || null : null,
          price: null,
          barcode: item.barcode
        })
        // データにも仮IDを設定
        item.productId = tempProductId
      }
    }

    // 新カテゴリーをマスターに登録
    if (newCategories.size > 0) {
      const newCategoryData = Array.from(newCategories).map((categoryName, index) => ({
        category_id: -1 * (Date.now() + index), // 仮のカテゴリーID（負の値）
        category_name: categoryName,
        category_short_name: categoryName,
        is_visible: '1'
      }))

      const { error: categoryError } = await supabase
        .from('category_master')
        .insert(newCategoryData)
      
      if (!categoryError) {
        console.log(`${newCategoryData.length}件の新カテゴリーをマスターに自動登録しました`)
        
        // 新しく登録したカテゴリーのIDをマップに追加
        newCategoryData.forEach(cat => {
          categoryNameToIdMap.set(cat.category_name, cat.category_id)
        })
      }
    }

    // 新商品をマスターに一括登録（カテゴリーIDを更新）
    if (newProducts.length > 0) {
      // カテゴリーIDを最新の情報で更新
      const updatedNewProducts = newProducts.map(product => {
        const item = data.find((d: any) => d.productName === product.product_name)
        return {
          ...product,
          category_id: item?.category ? categoryNameToIdMap.get(item.category) || null : null
        }
      })

      const { error: insertError } = await supabase
        .from('product_master')
        .insert(updatedNewProducts)
      
      if (insertError) {
        console.error('新商品のマスター登録エラー:', insertError)
      } else {
        console.log(`${updatedNewProducts.length}件の新商品をマスターに自動登録しました`)
      }
    }

    // データを整形して保存
    const formattedData = data.map((item: any) => ({
      product_name: item.productName,
      category: item.category,
      tax_type: item.taxType,
      total_sales: item.totalSales,
      sales_ratio: item.salesRatio,
      gross_profit: item.grossProfit,
      gross_profit_ratio: item.grossProfitRatio,
      quantity_sold: item.quantitySold,
      quantity_ratio: item.quantityRatio,
      returned_quantity: item.returnedQuantity,
      return_ratio: item.returnRatio,
      product_id: item.productId,
      product_code: item.productCode,
      barcode: item.barcode,
      report_month: reportMonth
    }))

    const { error: insertError } = await supabase
      .from('brand_store_sales')
      .insert(formattedData)

    if (insertError) throw insertError

    return NextResponse.json({ 
      success: true,
      newProductsCount: newProducts.length,
      newCategoriesCount: newCategories.size,
      message: `新商品${newProducts.length}件、新カテゴリー${newCategories.size}件を自動登録しました`
    })
  } catch (error) {
    console.error('Confirm error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : '保存に失敗しました' 
    }, { status: 500 })
  }
}
