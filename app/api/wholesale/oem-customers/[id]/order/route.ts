// /app/api/wholesale/oem-customers/[id]/order/route.ts ver.1
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { direction } = body;

    // 全顧客を取得
    const { data: customers, error: fetchError } = await supabase
      .from('oem_customers')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (fetchError || !customers) {
      return NextResponse.json({ error: '顧客データ取得エラー' }, { status: 500 });
    }

    // 現在の顧客のインデックスを見つける
    const currentIndex = customers.findIndex(c => c.id === params.id);
    if (currentIndex === -1) {
      return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 });
    }

    // 移動先のインデックスを計算
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= customers.length) {
      return NextResponse.json({ error: '移動できません' }, { status: 400 });
    }

    // 配列を並び替え
    const newCustomers = [...customers];
    [newCustomers[currentIndex], newCustomers[newIndex]] = [newCustomers[newIndex], newCustomers[currentIndex]];

    // display_orderを更新
    const updates = newCustomers.map((customer, index) => ({
      id: customer.id,
      display_order: index + 1
    }));

    // バッチ更新
    for (const update of updates) {
      await supabase
        .from('oem_customers')
        .update({ display_order: update.display_order })
        .eq('id', update.id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '並び順変更エラー' }, { status: 500 });
  }
}
