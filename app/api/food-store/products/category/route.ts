// /app/api/food-store/products/category/route.ts ver.1
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { janCode, productName, categoryId } = body

    // まず商品が存在するか確認
    const { data: existingProduct } = await supabase
      .from('food_product_master')
      .select('*')
      .eq('jan_code', janCode)
      .single()

    if (existingProduct) {
      // 既存の商品を更新
      const { error: updateError } = await supabase
        .from('food_product_master')
        .update({ 
          category_id: categoryId,
          updated_at: new Date().toISOString()
        })
        .eq('jan_code', janCode)

      if (updateError) {
        console.error('Update error:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    } else {
      // 新規商品として挿入
      const { error: insertError } = await supabase
        .from('food_product_master')
        .insert({
          jan_code: janCode,
          product_name: productName,
          category_id: categoryId
        })

      if (insertError) {
        console.error('Insert error:', insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'カテゴリーの更新に失敗しました' }, { status: 500 })
  }
}
