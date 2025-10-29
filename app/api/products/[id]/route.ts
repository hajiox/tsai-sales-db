// app/api/products/[id]/route.ts
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
    const { id } = params;
    
    // 更新データから不要なフィールドを除外
    const { id: _, created_at, updated_at, ...updateData } = body;
    
    const { data, error } = await supabase
      .from('products')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('商品更新エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message }, 
        { status: 400 }
      );
    }
    
    return NextResponse.json({ success: true, product: data });
  } catch (error: any) {
    console.error('商品更新エラー:', error);
    return NextResponse.json(
      { success: false, error: error.message || '商品の更新に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('商品削除エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message }, 
        { status: 400 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('商品削除エラー:', error);
    return NextResponse.json(
      { success: false, error: error.message || '商品の削除に失敗しました' },
      { status: 500 }
    );
  }
}
