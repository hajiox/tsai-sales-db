// /api/wholesale/products/route.ts ver.5 利益率対応版
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET() {
  try {
    const { data: products, error } = await supabase
      .from('wholesale_products')
      .select('*')
      .order('display_order', { ascending: true })
      .order('product_code', { ascending: true });

    if (error) {
      console.error('商品データ取得エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      products: products || []
    });
  } catch (error) {
    console.error('API エラー:', error);
    return NextResponse.json(
      { success: false, error: 'データの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { product_code, product_name, price, profit_rate = 20.00 } = body;

    if (!product_code || !product_name || price === undefined) {
      return NextResponse.json(
        { success: false, error: '必須項目が入力されていません' },
        { status: 400 }
      );
    }

    // 既存商品の最大display_orderを取得
    const { data: maxOrderData } = await supabase
      .from('wholesale_products')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1);

    const nextOrder = maxOrderData && maxOrderData[0]?.display_order 
      ? maxOrderData[0].display_order + 1 
      : 1;

    const { data, error } = await supabase
      .from('wholesale_products')
      .insert([
        {
          product_code,
          product_name,
          price: parseInt(price),
          profit_rate: parseFloat(profit_rate),
          display_order: nextOrder,
          is_active: true
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('商品登録エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      product: data
    });
  } catch (error) {
    console.error('API エラー:', error);
    return NextResponse.json(
      { success: false, error: '商品の登録に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, product_code, product_name, price, profit_rate, is_active } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: '商品IDが指定されていません' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (product_code !== undefined) updateData.product_code = product_code;
    if (product_name !== undefined) updateData.product_name = product_name;
    if (price !== undefined) updateData.price = parseInt(price);
    if (profit_rate !== undefined) updateData.profit_rate = parseFloat(profit_rate);
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('wholesale_products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('商品更新エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      product: data
    });
  } catch (error) {
    console.error('API エラー:', error);
    return NextResponse.json(
      { success: false, error: '商品の更新に失敗しました' },
      { status: 500 }
    );
  }
}
