// /app/api/wholesale/oem-sales/route.ts ver.1
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    if (!month) {
      return NextResponse.json({ 
        success: false, 
        error: "月の指定が必要です" 
      }, { status: 400 });
    }

    // 月の開始日と終了日を計算
    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];

    // OEM売上データを取得（商品名、顧客名も結合）
    const { data: sales, error } = await supabase
      .from("oem_sales")
      .select(`
        *,
        oem_products!inner(product_name, product_code),
        oem_customers!inner(customer_name, customer_code)
      `)
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
    const supabase = await createClient();
    const body = await request.json();
    const { 
      productId, 
      customerId, 
      saleDate, 
      quantity, 
      unitPrice 
    } = body;

    // 必須項目チェック
    if (!productId || !customerId || !saleDate || !quantity || !unitPrice) {
      return NextResponse.json({ 
        success: false, 
        error: "必須項目が不足しています" 
      }, { status: 400 });
    }

    // 金額計算
    const amount = quantity * unitPrice;

    // データ挿入または更新
    const { data, error } = await supabase
      .from("oem_sales")
      .upsert({
        product_id: productId,
        customer_id: customerId,
        sale_date: saleDate,
        quantity,
        unit_price: unitPrice,
        amount
      }, {
        onConflict: "product_id,customer_id,sale_date"
      });

    if (error) {
      console.error("OEM売上データ保存エラー:", error);
      return NextResponse.json({ 
        success: false, 
        error: "データ保存に失敗しました" 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("サーバーエラー:", error);
    return NextResponse.json({ 
      success: false, 
      error: "サーバーエラーが発生しました" 
    }, { status: 500 });
  }
}

// 個別削除用
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ 
        success: false, 
        error: "IDが指定されていません" 
      }, { status: 400 });
    }

    const { error } = await supabase
      .from("oem_sales")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("OEM売上データ削除エラー:", error);
      return NextResponse.json({ 
        success: false, 
        error: "データ削除に失敗しました" 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("サーバーエラー:", error);
    return NextResponse.json({ 
      success: false, 
      error: "サーバーエラーが発生しました" 
    }, { status: 500 });
  }
}
