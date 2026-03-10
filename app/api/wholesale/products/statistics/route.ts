// ver.3 — OEMフィルタ対応
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const productType = searchParams.get('type'); // '通常卸' | 'OEM' | null

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

    // product_typeでフィルタ（指定されている場合）
    let filteredData = data || [];
    if (productType) {
      // 商品タイプでフィルタするため商品マスタから取得
      const { data: products } = await supabase
        .from('wholesale_products')
        .select('id')
        .eq('product_type', productType);
      
      if (products) {
        const productIds = new Set(products.map((p: any) => p.id));
        filteredData = filteredData.filter((stat: any) => productIds.has(stat.product_id));
      }
    }

    return NextResponse.json({
      success: true,
      statistics: filteredData
    });

  } catch (error) {
    console.error('API エラー:', error);
    return NextResponse.json(
      { success: false, error: 'データの取得に失敗しました' },
      { status: 500 }
    );
  }
}
