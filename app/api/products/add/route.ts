// /app/api/products/add/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { name, price, amazonTitle } = await request.json()

    // 必須項目チェック
    if (!name || !price) {
      return NextResponse.json(
        { error: '商品名と価格は必須です' },
        { status: 400 }
      )
    }

    // 既存商品名の重複チェック
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id, name')
      .eq('name', name)
      .single()

    if (existingProduct) {
      return NextResponse.json(
        { error: '同じ商品名が既に存在します' },
        { status: 409 }
      )
    }

    // 自動採番用のシリーズ番号を取得（最大値+1）
    const { data: maxProduct } = await supabase
      .from('products')
      .select('series')
      .order('series', { ascending: false })
      .limit(1)
      .single()

    const nextSeries = maxProduct ? maxProduct.series + 1 : 1001

    // 商品番号を自動生成（例: P1001, P1002...）
    const productNumber = `P${nextSeries}`

    // 新商品をproductsテーブルに追加
    const { data: newProduct, error: insertError } = await supabase
      .from('products')
      .insert({
        name: name.trim(),
        series: nextSeries,
        product_number: productNumber,
        price: price,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('商品追加エラー:', insertError)
      return NextResponse.json(
        { error: '商品の追加に失敗しました' },
        { status: 500 }
      )
    }

    // Amazon商品名マッピングテーブルに学習データとして追加
    if (amazonTitle) {
      const { error: mappingError } = await supabase
        .from('amazon_product_mapping')
        .insert({
          amazon_title: amazonTitle,
          product_id: newProduct.id,
          created_at: new Date().toISOString()
        })

      if (mappingError) {
        console.error('マッピング追加エラー:', mappingError)
        // マッピングエラーは商品追加成功を妨げない
      }
    }

    return NextResponse.json({
      message: '商品を追加しました',
      product: newProduct,
      series: nextSeries,
      productNumber: productNumber
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}
