// /app/api/food-store/import/route.ts ver.3
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  console.log('API Route called')
  
  try {
    const body = await request.json()
    console.log('Request body received:', { 
      dataLength: body.data?.length, 
      reportMonth: body.reportMonth 
    })

    const { data, reportMonth } = body

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: '有効なデータが見つかりませんでした' },
        { status: 400 }
      )
    }

    const supabase = createRouteHandlerClient({ cookies })

    // 既存データの削除
    console.log('Deleting existing data for:', reportMonth)
    const { error: deleteError } = await supabase
      .from('food_store_sales')
      .delete()
      .eq('report_month', reportMonth)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json(
        { error: '既存データの削除に失敗しました', details: deleteError.message },
        { status: 500 }
      )
    }

    // 新規データの挿入
    console.log('Inserting new data:', data.length, 'records')
    const { error: insertError } = await supabase
      .from('food_store_sales')
      .insert(data)

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json(
        { error: 'データの登録に失敗しました', details: insertError.message },
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

    console.log('Updating product master:', uniqueProducts.length, 'products')
    const { error: masterError } = await supabase
      .from('food_product_master')
      .upsert(uniqueProducts, { onConflict: 'jan_code' })

    if (masterError) {
      console.error('Master update error:', masterError)
      // エラーがあってもインポートは成功とする
    }

    return NextResponse.json({ 
      success: true, 
      count: data.length 
    })

  } catch (error: any) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}

// デバッグ用にGETメソッドも追加
export async function GET() {
  return NextResponse.json({ message: 'Food Store Import API is working' })
}
