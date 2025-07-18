// /api/wholesale/products/statistics/route.ts ver.1
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!year || !month) {
      return NextResponse.json(
        { success: false, error: '年月の指定が必要です' },
        { status: 400 }
      );
    }

    // 全商品の販売統計を取得
    const { data, error } = await supabase.rpc(
      'get_all_wholesale_product_statistics',
      { 
        p_year: parseInt(year),
        p_month: parseInt(month)
      }
    );

    if (error) {
      console.error('統計データ取得エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      statistics: data || []
    });

  } catch (error) {
    console.error('API エラー:', error);
    return NextResponse.json(
      { success: false, error: 'データの取得に失敗しました' },
      { status: 500 }
    );
  }
}
