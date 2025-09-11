// /app/api/products/delete/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
)

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json()

    // 必須項目チェック
    if (!id) {
      return NextResponse.json(
        { error: '削除する商品IDが指定されていません' },
        { status: 400 }
      )
    }

    // 商品が存在するかチェック
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id, name, series_code, product_code')
      .eq('id', id)
      .single()

    if (!existingProduct) {
      return NextResponse.json(
        { error: '指定された商品が見つかりません' },
        { status: 404 }
      )
    }

    // 商品を削除
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('商品削除エラー:', deleteError)
      return NextResponse.json(
        { error: '商品の削除に失敗しました', details: deleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `商品「${existingProduct.name}」を削除しました`,
      data: existingProduct
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました', details: error.message },
      { status: 500 }
    )
  }
}
