// /app/api/wholesale/oem-products/[id]/order/route.ts ver.1 並び順変更
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { direction } = body
    const { id } = params

    // 現在の商品情報を取得
    const { data: currentProduct, error: fetchError } = await supabase
      .from('oem_products')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !currentProduct) {
      return NextResponse.json({ error: '商品が見つかりません' }, { status: 404 })
    }

    // すべての商品を並び順で取得
    const { data: allProducts, error: allError } = await supabase
      .from('oem_products')
      .select('*')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (allError || !allProducts) {
      return NextResponse.json({ error: '商品リストの取得に失敗しました' }, { status: 500 })
    }

    // 現在の商品のインデックスを見つける
    const currentIndex = allProducts.findIndex(p => p.id === id)
    if (currentIndex === -1) {
      return NextResponse.json({ error: '商品が見つかりません' }, { status: 404 })
    }

    // 移動先のインデックスを計算
    let targetIndex = currentIndex
    if (direction === 'up' && currentIndex > 0) {
      targetIndex = currentIndex - 1
    } else if (direction === 'down' && currentIndex < allProducts.length - 1) {
      targetIndex = currentIndex + 1
    } else {
      // 移動できない場合は何もしない
      return NextResponse.json({ success: true })
    }

    // display_orderを更新
    const updates = []
    
    // 並び順を再割り当て
    const reorderedProducts = [...allProducts]
    const [movedProduct] = reorderedProducts.splice(currentIndex, 1)
    reorderedProducts.splice(targetIndex, 0, movedProduct)

    // 新しい並び順を設定
    for (let i = 0; i < reorderedProducts.length; i++) {
      updates.push({
        id: reorderedProducts[i].id,
        display_order: i + 1
      })
    }

    // バッチ更新
    for (const update of updates) {
      await supabase
        .from('oem_products')
        .update({ display_order: update.display_order })
        .eq('id', update.id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
