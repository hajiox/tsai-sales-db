// /app/api/products/add-learning/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
)

export async function POST(request: NextRequest) {
  try {
    const { amazonTitle, productId } = await request.json()

    // 必須項目チェック
    if (!amazonTitle || !productId) {
      return NextResponse.json(
        { error: 'Amazon商品名と商品IDは必須です' },
        { status: 400 }
      )
    }

    // 既存の学習データをチェック（重複防止）
    const { data: existingMapping } = await supabase
      .from('amazon_product_mapping')
      .select('id')
      .eq('amazon_title', amazonTitle)
      .eq('product_id', productId)
      .single()

    if (existingMapping) {
      return NextResponse.json(
        { message: '既に学習済みです' },
        { status: 200 }
      )
    }

    // 学習データをamazon_product_mappingテーブルに追加
    const { data, error: insertError } = await supabase
      .from('amazon_product_mapping')
      .insert({
        amazon_title: amazonTitle,
        product_id: productId,
        created_at: new Date().toISOString()
      })
      .select()

    if (insertError) {
      console.error('学習データ追加エラー:', insertError)
      return NextResponse.json(
        { error: '学習データの追加に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: '学習データを追加しました',
      mapping: data
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    )
  }
}
