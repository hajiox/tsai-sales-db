// /app/api/wholesale/oem-customers/route.ts ver.4 自動採番対応版
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get('all') === 'true';

    let query = supabase
      .from('oem_customers')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    // allパラメータがない場合はアクティブのみ
    if (!all) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      customers: data || [] 
    });
  } catch (error) {
    return NextResponse.json({ error: 'データ取得エラー' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customer_name, is_active = true } = body;

    if (!customer_name) {
      return NextResponse.json({ error: '顧客名は必須です' }, { status: 400 });
    }

    // 最新の顧客コードを取得して次の番号を決定
    const { data: lastCustomer } = await supabase
      .from('oem_customers')
      .select('customer_code')
      .like('customer_code', 'OEM%')
      .order('customer_code', { ascending: false })
      .limit(1)
      .single();

    let nextNumber = 1;
    if (lastCustomer && lastCustomer.customer_code) {
      const match = lastCustomer.customer_code.match(/OEM(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    const customer_code = `OEM${String(nextNumber).padStart(4, '0')}`;

    const { data, error } = await supabase
      .from('oem_customers')
      .insert([{
        customer_code,
        customer_name,
        is_active
      }])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, customer: data });
  } catch (error) {
    return NextResponse.json({ error: '追加エラー' }, { status: 500 });
  }
}
