// /app/api/products/update/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, price, series_code, product_code, series } = body

    if (!id || !name || price === undefined) {
      return NextResponse.json(
        { error: 'ID、商品名、価格は必須です' },
        { status: 400 }
      )
    }

    const supabase = createRouteHandlerClient({ cookies })

    // 商品情報を更新
    const { data, error } = await supabase
      .from('products')
      .update({
        name,
        price,
        series_code,
        product_code,
        series
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('商品更新エラー:', error)
      return NextResponse.json(
        { error: '商品の更新に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      data,
      message: '商品情報を更新しました' 
    })

  } catch (error) {
    console.error('商品更新エラー:', error)
    return NextResponse.json(
      { error: '商品の更新に失敗しました' },
      { status: 500 }
    )
  }
}
