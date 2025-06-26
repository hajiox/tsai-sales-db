// /app/api/products/add/route.ts ver.2
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { name, price, series_code, product_code, series } = await request.json()

    // 必須項目チェック
    if (!name || !price || !series_code || !product_code || !series) {
      return NextResponse.json(
        { error: '商品名、価格、シリーズ番号、商品番号、シリーズ名は必須です' },
        { status: 400 }
      )
    }

    // シリーズ番号と商品番号の組み合わせで重複チェック
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id, name, series_code, product_code')
      .eq('series_code', series_code)
      .eq('product_code', product_code)
      .single()

    if (existingProduct) {
      return NextResponse.json(
        { error: `シリーズ番号${series_code}・商品番号${product_code}の組み合わせは既に存在します` },
        { status: 409 }
      )
    }

    // 新商品をproductsテーブルに追加
    const { data: newProduct, error: insertError } = await supabase
      .from('products')
      .insert({
        name: name.trim(),
        series: series.trim(),
        series_code: parseInt(series_code),
        product_code: parseInt(product_code),
        price: parseInt(price),
        global_product: false
      })
      .select()
      .single()

    if (insertError) {
      console.error('商品追加エラー:', insertError)
      return NextResponse.json(
        { error: '商品の追加に失敗しました', details: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '商品を追加しました',
      data: newProduct
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました', details: error.message },
      { status: 500 }
    )
  }
}
