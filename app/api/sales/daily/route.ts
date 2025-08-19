// ver.4 (2025-08-19 JST) - disable prerender; runtime=node; no revalidate
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

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

    // 日別データを取得
    const { data, error } = await supabase
      .from('daily_sales_report')
      .select('*')
      .eq('date', dateString);

    if (error) {
      console.error("日次データ取得エラー:", error);
      return NextResponse.json({ 
        error: `日次データ取得エラー: ${error.message}` 
      }, { status: 500 });
    }

    // データが存在する場合は最初の要素、存在しない場合は空オブジェクト
    return NextResponse.json({ 
      success: true, 
      data: data && data.length > 0 ? data[0] : {} 
    });

  } catch (error) {
    console.error("サーバーエラー:", error);
    return NextResponse.json({ 
      error: "サーバーエラーが発生しました" 
    }, { status: 500 });
  }
}
