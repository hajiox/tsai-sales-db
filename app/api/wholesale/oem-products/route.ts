// /app/api/wholesale/oem-products/route.ts ver.2 自動採番対応版
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('oem_products')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { product_name, price } = body;

    if (!product_name || price === undefined) {
      return NextResponse.json({ error: 'Product name and price are required' }, { status: 400 });
    }

    // 最新の商品コードを取得して次の番号を決定
    const { data: lastProduct } = await supabase
      .from('oem_products')
      .select('product_code')
      .order('product_code', { ascending: false })
      .limit(1)
      .single();

    let nextNumber = 1;
    if (lastProduct && lastProduct.product_code) {
      const numericCode = parseInt(lastProduct.product_code);
      if (!isNaN(numericCode)) {
        nextNumber = numericCode + 1;
      }
    }

    const product_code = String(nextNumber).padStart(4, '0');

    const { data, error } = await supabase
      .from('oem_products')
      .insert([{
        product_code,
        product_name,
        price,
        is_active: true
      }])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, product: data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
