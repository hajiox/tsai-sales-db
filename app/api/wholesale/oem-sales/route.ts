// /app/api/wholesale/oem-sales/route.ts ver.4 GET処理を元に戻した安定版
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
        error: "月の指定が必要です" 
      }, { status: 400 });
    }

    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];

    // ▼▼▼ 修正点 ▼▼▼
    // 安定して動作していた元のデータ取得方法に戻します
    const { data: sales, error } = await supabase
      .from("oem_sales")
      .select(`*`) // フロント側で商品名・顧客名を結合するため、ここでは売上データのみ取得
      .gte("sale_date", startDate)
      .lte("sale_date", endDate)
      .order("created_at", { ascending: false });
    // ▲▲▲ 修正点 ▲▲▲

    if (error) {
      console.error("OEM売上データ取得エラー:", error);
      return NextResponse.json({ 
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
      error: "サーバーエラーが発生しました" 
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const body = await request.json();
    
    const { 
      product_id, 
      customer_id, 
      sale_date, 
      quantity, 
      unit_price 
    } = body;

    if (!product_id || !customer_id || !sale_date || !quantity || !unit_price) {
      return NextResponse.json({ 
        error: "必須項目が不足しています" 
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("oem_sales")
      .upsert({
        product_id: product_id,
        customer_id: customer_id,
        sale_date: sale_date,
        quantity: quantity,
        unit_price: unit_price,
      }, {
        onConflict: "product_id,customer_id,sale_date",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error("OEM売上データ保存エラー:", error);
      if (error.code === '23505') {
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
