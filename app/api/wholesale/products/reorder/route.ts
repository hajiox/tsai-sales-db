// /app/api/wholesale/products/reorder/route.ts
// ドラッグ&ドロップ用並び替えAPI
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { orderedIds } = body; // string[] — 新しい順序のID配列

    if (!orderedIds || !Array.isArray(orderedIds)) {
      return NextResponse.json({ success: false, error: 'orderedIds is required' }, { status: 400 });
    }

    // 一括でdisplay_orderを更新
    const updates = orderedIds.map((id: string, index: number) =>
      supabase
        .from('wholesale_products')
        .update({ display_order: index + 1 })
        .eq('id', id)
    );

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
