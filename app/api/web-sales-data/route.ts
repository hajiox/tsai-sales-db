import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// 既存のGET処理
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const month = searchParams.get('month');

  if (!month) {
    return NextResponse.json(
      { error: 'month パラメータが必要です' },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase.rpc('web_sales_full_month', {
      target_month: month
    });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('データ取得エラー:', error);
    return NextResponse.json(
      { error: 'データの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 新規追加：販売数保存処理
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, report_month, field, value } = body;

    if (!product_id || !report_month || !field || value === undefined) {
      return NextResponse.json(
        { error: '必須パラメータが不足しています' },
        { status: 400 }
      );
    }

    // 対象月のレコードを確認・作成
    const { data: existingData, error: selectError } = await supabase
      .from('web_sales_summary')
      .select('id')
      .eq('product_id', product_id)
      .eq('report_month', report_month)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      throw selectError;
    }

    let result;
    if (existingData) {
      // 既存レコードを更新
      const { data, error } = await supabase
        .from('web_sales_summary')
        .update({ [field]: value })
        .eq('product_id', product_id)
        .eq('report_month', report_month)
        .select();

      if (error) throw error;
      result = data;
    } else {
      // 新規レコードを作成
      const insertData = {
        product_id,
        report_month,
        amazon_count: 0,
        rakuten_count: 0,
        yahoo_count: 0,
        mercari_count: 0,
        base_count: 0,
        qoo10_count: 0,
        [field]: value
      };

      const { data, error } = await supabase
        .from('web_sales_summary')
        .insert(insertData)
        .select();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ 
      success: true, 
      message: '販売数が保存されました',
      data: result 
    });

  } catch (error) {
    console.error('販売数保存エラー:', error);
    return NextResponse.json(
      { error: '販売数の保存に失敗しました' },
      { status: 500 }
    );
  }
}
