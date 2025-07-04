// /api/wholesale/products/route.ts ver.1
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 商品マスタを取得
    const { data: products, error } = await supabase
      .from('wholesale_products')
      .select('*')
      .eq('is_active', true)
      .order('product_code');

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      products: products || [],
      count: products?.length || 0
    });
  } catch (error: any) {
    console.error('商品取得エラー:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
