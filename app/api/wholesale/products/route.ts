// /app/api/wholesale/products/route.ts ver.4
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: 商品一覧を取得
export async function GET() {
  try {
    const { data: products, error } = await supabase
      .from('wholesale_products')
      .select('*')
      .order('display_order', { ascending: true, nullsLast: true }); // NULL値を最後に表示するよう修正

    if (error) {
      console.error('Supabase Error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    // ★修正点： success: true をレスポンスに追加
    return NextResponse.json({ success: true, products });

  } catch (error: any) {
    console.error('Catch Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '商品の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: 商品を新規作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { data, error } = await supabase
      .from('wholesale_products')
      .insert([body])
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    
    return NextResponse.json({ success: true, product: data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '商品の作成に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT: 商品を更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: '商品IDが必要です' },
        { status: 400 }
      );
    }
    
    const { data, error } = await supabase
      .from('wholesale_products')
      .update(updateData)
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
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: '商品IDが必要です' },
        { status: 400 }
      );
    }
    
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
