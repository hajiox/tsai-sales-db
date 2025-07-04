// /app/api/wholesale/products/route.ts ver.2 (CRUD対応版)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: 商品一覧取得
export async function GET() {
  try {
    const { data: products, error } = await supabase
      .from('wholesale_products')
      .select('*')
      .eq('is_active', true)
      .order('product_name', { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, products });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST: 商品追加
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_code, product_name, price } = body;

    const { data, error } = await supabase
      .from('wholesale_products')
      .insert({
        product_code,
        product_name,
        price,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, product: data });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: 商品更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, product_code, product_name, price } = body;

    const { data, error } = await supabase
      .from('wholesale_products')
      .update({
        product_code,
        product_name,
        price
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, product: data });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: 商品削除（論理削除）
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    const { error } = await supabase
      .from('wholesale_products')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
