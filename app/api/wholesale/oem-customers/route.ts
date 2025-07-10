// /app/api/wholesale/oem-customers/route.ts ver.1
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // アクティブな顧客のみ取得
    const { data: customers, error } = await supabase
      .from("oem_customers")
      .select("*")
      .eq("is_active", true)
      .order("customer_name", { ascending: true });

    if (error) {
      console.error("OEM顧客データ取得エラー:", error);
      return NextResponse.json({ 
        success: false, 
        error: "データ取得に失敗しました" 
      }, { status: 500 });
    }

    return NextResponse.json(customers || []);
  } catch (error) {
    console.error("サーバーエラー:", error);
    return NextResponse.json({ 
      success: false, 
      error: "サーバーエラーが発生しました" 
    }, { status: 500 });
  }
}
