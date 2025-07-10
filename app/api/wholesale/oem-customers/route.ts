// /app/api/wholesale/oem-customers/route.ts ver.2 全顧客取得対応版
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

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json({ error: 'データ取得エラー' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customer_code, customer_name, is_active = true } = body;

    if (!customer_code || !customer_name) {
      return NextResponse.json({ error: '顧客コードと顧客名は必須です' }, { status: 400 });
    }

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
