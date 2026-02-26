// /app/api/products/delete/route.ts ver.2 (カスケード削除対応)
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

    // 関連テーブルを先に削除（FK制約回避のためのカスケード削除）
    const relatedTables = [
      { table: 'web_sales_summary', column: 'product_id' },
      { table: 'product_price_history', column: 'product_id' },
      { table: 'amazon_product_mapping', column: 'product_id' },
      { table: 'rakuten_product_mapping', column: 'product_id' },
      { table: 'yahoo_product_mapping', column: 'product_id' },
      { table: 'mercari_product_mapping', column: 'product_id' },
      { table: 'base_product_mapping', column: 'product_id' },
      { table: 'qoo10_product_mapping', column: 'product_id' },
      { table: 'tiktok_product_mapping', column: 'product_id' },
    ]

    const deletionLog: string[] = []

    for (const { table, column } of relatedTables) {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq(column, id)

      if (error) {
        console.error(`${table} 削除エラー:`, error)
        // テーブルが存在しない場合等はスキップ
        deletionLog.push(`${table}: error (${error.message})`)
      } else {
        if (count && count > 0) {
          deletionLog.push(`${table}: ${count}件削除`)
        }
      }
    }

    // recipes テーブルの linked_product_id をnullに（レシピ自体は残す）
    const { error: recipeError, count: recipeCount } = await supabase
      .from('recipes')
      .update({ linked_product_id: null })
      .eq('linked_product_id', id)

    if (!recipeError && recipeCount && recipeCount > 0) {
      deletionLog.push(`recipes: ${recipeCount}件のリンク解除`)
    }

    // 商品本体を削除
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

    console.log(`商品「${existingProduct.name}」を削除:`, deletionLog)

    return NextResponse.json({
      success: true,
      message: `商品「${existingProduct.name}」を削除しました`,
      data: existingProduct,
      deletionLog,
    })

  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました', details: error.message },
      { status: 500 }
    )
  }
}
