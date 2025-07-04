// /app/api/wholesale/sales/route.ts ver.1
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    
    if (!month) {
      return NextResponse.json({ error: '月が指定されていません' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 月の開始日と終了日を計算
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];

    // 売上データを取得
    const { data: sales, error } = await supabase
      .from('wholesale_sales')
      .select(`
        *,
        product:wholesale_products(*)
      `)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate);

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      sales: sales || []
    });
  } catch (error: any) {
    console.error('売上データ取得エラー:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { productId, customerId, saleDate, quantity, unitPrice } = await request.json();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 金額を計算
    const amount = quantity * unitPrice;

    // 既存データを確認
    const { data: existing } = await supabase
      .from('wholesale_sales')
      .select('id')
      .eq('product_id', productId)
      .eq('customer_id', customerId || 'default')
      .eq('sale_date', saleDate)
      .single();

    if (existing) {
      // 更新
      if (quantity === 0) {
        // 削除
        const { error } = await supabase
          .from('wholesale_sales')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // 更新
        const { error } = await supabase
          .from('wholesale_sales')
          .update({ quantity, unit_price: unitPrice, amount })
          .eq('id', existing.id);
        if (error) throw error;
      }
    } else if (quantity > 0) {
      // 新規作成
      const { error } = await supabase
        .from('wholesale_sales')
        .insert({
          product_id: productId,
          customer_id: customerId || 'default',
          sale_date: saleDate,
          quantity,
          unit_price: unitPrice,
          amount
        });
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('売上データ保存エラー:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
