// /app/api/wholesale/sales/delete-month/route.ts ver.2 (customer_id条件を削除)
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function DELETE(request: Request) {
  try {
    const { month } = await request.json();
    
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, error: '有効な年月を指定してください' },
        { status: 400 }
      );
    }

    // 月の最終日を計算
    const [year, monthNum] = month.split('-').map(Number);
    const lastDay = new Date(year, monthNum, 0).getDate();
    
    // 指定月のデータを削除（customer_idの条件を削除）
    const { data, error } = await supabase
      .from('wholesale_sales')
      .delete()
      .gte('sale_date', `${month}-01`)
      .lte('sale_date', `${month}-${lastDay}`)
      .select();

    if (error) {
      console.error('削除エラー:', error);
      return NextResponse.json(
        { success: false, error: '削除に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted: data?.length || 0
    });

  } catch (error) {
    console.error('Delete month error:', error);
    return NextResponse.json(
      { success: false, error: '削除処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
