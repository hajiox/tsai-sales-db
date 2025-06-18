import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
    
    const { data, error } = await supabase
      .from('web_sales_summary')
      .select('*')
      
    if (error) {
      console.error('Supabaseエラー:', error)
      return NextResponse.json({ 
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      data: data || [],
      count: data?.length || 0
    })
    
  } catch (error: any) {
    console.error('APIエラー:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const body = await request.json();
    const { product_id, report_month, field, value } = body;

    if (!product_id || !report_month || !field || value === undefined) {
      return NextResponse.json(
        { error: '必須パラメータが不足しています' },
        { status: 400 }
      );
    }

    // 月形式を日付形式に変換 (2025-04 → 2025-04-01)
    const formattedMonth = report_month.length === 7 ? `${report_month}-01` : report_month;

    // 既存レコードを検索
    const { data: existingData, error: selectError } = await supabase
      .from('web_sales_summary')
      .select('*')
      .eq('product_id', product_id)
      .eq('report_month', formattedMonth);

    if (selectError) {
      console.error('検索エラー:', selectError);
      throw selectError;
    }

    let result;
    if (existingData && existingData.length > 0) {
      // 既存レコードを更新
      const { data, error } = await supabase
        .from('web_sales_summary')
        .update({ [field]: value })
        .eq('product_id', product_id)
        .eq('report_month', formattedMonth)
        .select();

      if (error) throw error;
      result = data;
    } else {
      // 新規レコードを作成
      const insertData = {
        product_id,
        report_month: formattedMonth,
        amazon_count: field === 'amazon_count' ? value : 0,
        rakuten_count: field === 'rakuten_count' ? value : 0,
        yahoo_count: field === 'yahoo_count' ? value : 0,
        mercari_count: field === 'mercari_count' ? value : 0,
        base_count: field === 'base_count' ? value : 0,
        qoo10_count: field === 'qoo10_count' ? value : 0
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

  } catch (error: any) {
    console.error('販売数保存エラー:', error);
    return NextResponse.json(
      { 
        error: '販売数の保存に失敗しました', 
        details: error.message
      },
      { status: 500 }
    );
  }
}
