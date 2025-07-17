// /app/api/sales/six-month/route.ts ver.1
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  try {
    // 認証チェック
    const session = await getServerSession(authOptions);
    if (!session?.supabaseAccessToken) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // URLパラメータから日付を取得
    const { searchParams } = new URL(request.url);
    const dateString = searchParams.get("date");

    if (!dateString) {
      return NextResponse.json({ error: "日付が指定されていません" }, { status: 400 });
    }

    // サービスロールキーを使用してSupabaseクライアントを作成
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false
      }
    });

    // 6ヶ月分のデータを取得
    const { data, error } = await supabase.rpc('get_6month_sales_summary', { 
      end_date: dateString 
    });

    if (error) {
      console.error("グラフデータ取得エラー:", error);
      return NextResponse.json({ 
        error: `グラフデータ取得エラー: ${error.message}` 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      data: data || [] 
    });

  } catch (error) {
    console.error("サーバーエラー:", error);
    return NextResponse.json({ 
      error: "サーバーエラーが発生しました" 
    }, { status: 500 });
  }
}
