// /app/api/wholesale/oem-customers/[id]/route.ts ver.1
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { customer_code, customer_name, is_active } = body;

    if (!customer_code || !customer_name) {
      return NextResponse.json({ error: '顧客コードと顧客名は必須です' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('oem_customers')
      .update({
        customer_code,
        customer_name,
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, customer: data });
  } catch (error) {
    return NextResponse.json({ error: '更新エラー' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 売上データの存在確認
    const { data: sales, error: salesError } = await supabase
      .from('oem_sales')
      .select('id')
      .eq('customer_id', params.id)
      .limit(1);

    if (salesError) {
      return NextResponse.json({ error: salesError.message }, { status: 500 });
    }

    if (sales && sales.length > 0) {
      return NextResponse.json({ 
        error: 'この顧客には売上データが存在するため削除できません' 
      }, { status: 400 });
    }

    // 顧客削除
    const { error: deleteError } = await supabase
      .from('oem_customers')
      .delete()
      .eq('id', params.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '削除エラー' }, { status: 500 });
  }
}
