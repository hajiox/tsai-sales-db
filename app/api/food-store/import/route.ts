// /app/api/food-store/import/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data, reportMonth } = await request.json()

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: '有効なデータが見つかりませんでした' },
        { status: 400 }
      )
    }

    // 既存データの削除
    const { error: deleteError } = await supabase
      .from('food_store_sales')
      .delete()
      .eq('report_month', reportMonth)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json(
        { error: '既存データの削除に失敗しました' },
        { status: 500 }
      )
    }

    // 新規データの挿入
    const { error: insertError } = await supabase
      .from('food_store_sales')
      .insert(data)

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json(
        { error: 'データの登録に失敗しました' },
        { status: 500 }
      )
    }

    // 商品マスターの更新
    const productMasterData = data.map(item => ({
      jan_code: item.jan_code,
      product_name: item.product_name
    }))

    const uniqueProducts = Array.from(
      new Map(productMasterData.map(p => [p.jan_code, p])).values()
    )

    const { error: masterError } = await supabase
      .from('food_product_master')
      .upsert(uniqueProducts, { onConflict: 'jan_code' })

    if (masterError) {
      console.error('Master update error:', masterError)
    }

    return NextResponse.json({ 
      success: true, 
      count: data.length 
    })

  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}
