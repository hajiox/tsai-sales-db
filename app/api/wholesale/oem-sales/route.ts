// /app/api/wholesale/oem-sales/route.ts ver.3 キー名修正版
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    if (!month) {
      return NextResponse.json({ 
        success: false, 
        error: "月の指定が必要です" 
      }, { status: 400 });
    }

    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];

    const { data: sales, error } = await supabase
      .from("oem_sales_with_details") // パフォーマンス改善のためビューを使用
      .select('*')
      .gte("sale_date", startDate)
      .lte("sale_date", endDate)
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("OEM売上データ取得エラー:", error);
      return NextResponse.json({ 
        success: false, 
        error: "データ取得に失敗しました" 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      sales: sales || [] 
    });
  } catch (error) {
    console.error("サーバーエラー:", error);
    return NextResponse.json({ 
      success: false, 
      error: "サーバーエラーが発生しました" 
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const body = await request.json();
    
    // ▼▼▼ 修正点 ▼▼▼
    // フロントエンドから送られてくるキー名（スネークケース）に合わせる
    const { 
      product_id, 
      customer_id, 
      sale_date, 
      quantity, 
      unit_price 
    } = body;

    // 必須項目チェック（変数名もスネークケースに）
    if (!product_id || !customer_id || !sale_date || !quantity || !unit_price) {
      return NextResponse.json({ 
        error: "必須項目が不足しています" 
      }, { status: 400 });
    }
    // ▲▲▲ 修正点 ▲▲▲

    // データ挿入または更新
    const { data, error } = await supabase
      .from("oem_sales")
      .upsert({
        // ▼▼▼ 修正点 ▼▼▼
        // 変数名をスネークケースに統一
        product_id: product_id,
        customer_id: customer_id,
        sale_date: sale_date,
        quantity: quantity,
        unit_price: unit_price,
        // ▲▲▲ 修正点 ▲▲▲
      }, {
        onConflict: "product_id,customer_id,sale_date",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error("OEM売上データ保存エラー:", error);
      // DBからの詳細なエラーメッセージを返す
      if (error.code === '23505') { // unique_violation
          return NextResponse.json({ error: "同じ商品・顧客・月で既にデータが存在します。" }, { status: 409 });
      }
      return NextResponse.json({ error: "データ保存に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true, sale: data });
  } catch (error) {
    console.error("サーバーエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "IDが指定されていません" }, { status: 400 });
    }

    const { error } = await supabase
      .from("oem_sales")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("OEM売上データ削除エラー:", error);
      return NextResponse.json({ error: "データ削除に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("サーバーエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
