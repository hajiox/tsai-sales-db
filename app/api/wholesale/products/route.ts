// /api/wholesale/products/route.ts ver.7 統合版 — product_type更新・バッチ削除対応
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productType = searchParams.get('type'); // '通常卸' | 'OEM' | 'all' | null

    let query = supabase
      .from('wholesale_products')
      .select('*')
      .order('product_type', { ascending: true })
      .order('display_order', { ascending: true })
      .order('product_code', { ascending: true });

    // デフォルトは全件取得（統合ページ対応）
    if (productType === 'OEM') {
      query = query.eq('product_type', 'OEM');
    } else if (productType === '通常卸') {
      query = query.eq('product_type', '通常卸');
    }
    // 'all' or null → 全件取得

    const { data: products, error } = await query;

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
    const { product_code, product_name, price, profit_rate = 20.00, product_type = '通常卸', customer_id } = body;

    if (!product_name || price === undefined) {
      return NextResponse.json(
        { success: false, error: '必須項目が入力されていません' },
        { status: 400 }
      );
    }

    // 商品コード自動採番（未指定の場合）
    let finalProductCode = product_code;
    if (!finalProductCode) {
      const { data: maxCodeData } = await supabase
        .from('wholesale_products')
        .select('product_code')
        .order('product_code', { ascending: false })
        .limit(1);
      const maxCode = maxCodeData?.[0]?.product_code;
      const nextNum = maxCode ? parseInt(maxCode, 10) + 1 : 1;
      finalProductCode = String(nextNum).padStart(4, '0');
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

    const insertData: any = {
      product_code: finalProductCode,
      product_name,
      price: parseInt(price),
      profit_rate: parseFloat(profit_rate),
      display_order: nextOrder,
      is_active: true,
      product_type
    };
    if (customer_id) insertData.customer_id = customer_id;

    const { data, error } = await supabase
      .from('wholesale_products')
      .insert([insertData])
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
    const { id, product_code, product_name, price, profit_rate, is_active, product_type, customer_id } = body;

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
    if (product_type !== undefined) updateData.product_type = product_type;
    if (customer_id !== undefined) updateData.customer_id = customer_id || null;

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

// DELETE: バッチ削除
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: '削除対象が指定されていません' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('wholesale_products')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('バッチ削除エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount: ids.length
    });
  } catch (error) {
    console.error('API エラー:', error);
    return NextResponse.json(
      { success: false, error: '商品の削除に失敗しました' },
      { status: 500 }
    );
  }
}
