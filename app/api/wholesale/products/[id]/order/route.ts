// /app/api/wholesale/products/[id]/order/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { direction } = body;
    const { id } = params;
    
    // 全商品を取得
    const { data: products, error: fetchError } = await supabase
      .from('wholesale_products')
      .select('*')
      .order('display_order', { ascending: true, nullsLast: true });
    
    if (fetchError || !products) {
      return NextResponse.json({ success: false, error: '商品の取得に失敗しました' }, { status: 500 });
    }
    
    // 対象商品のインデックスを見つける
    const currentIndex = products.findIndex(p => p.id === id);
    if (currentIndex === -1) {
      return NextResponse.json({ success: false, error: '商品が見つかりません' }, { status: 404 });
    }
    
    // 移動先のインデックスを決定
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    // 範囲チェック
    if (targetIndex < 0 || targetIndex >= products.length) {
      return NextResponse.json({ success: false, error: '移動できません' }, { status: 400 });
    }
    
    // display_orderの値を入れ替える
    const currentProduct = products[currentIndex];
    const targetProduct = products[targetIndex];
    
    // 更新処理
    const updates = [
      supabase
        .from('wholesale_products')
        .update({ display_order: targetProduct.display_order || targetIndex + 1 })
        .eq('id', currentProduct.id),
      supabase
        .from('wholesale_products')
        .update({ display_order: currentProduct.display_order || currentIndex + 1 })
        .eq('id', targetProduct.id)
    ];
    
    const results = await Promise.all(updates);
    
    // エラーチェック
    for (const result of results) {
      if (result.error) {
        return NextResponse.json({ success: false, error: result.error.message }, { status: 500 });
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '並び順の変更に失敗しました' },
      { status: 500 }
    );
  }
}
