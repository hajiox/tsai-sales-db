// /app/api/wholesale/products/[id]/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
);

// PUT: 商品を更新
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { id } = params;
    
    const { data, error } = await supabase
      .from('wholesale_products')
      .update(body)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    
    return NextResponse.json({ success: true, product: data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '商品の更新に失敗しました' },
      { status: 500 }
    );
  }
}

// DELETE: 商品を削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // 関連する売上データも削除される（外部キー制約によるカスケード削除）
    const { error } = await supabase
      .from('wholesale_products')
      .delete()
      .eq('id', id);
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '商品の削除に失敗しました' },
      { status: 500 }
    );
  }
}
