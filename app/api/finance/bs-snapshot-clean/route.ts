// /app/api/finance/bs-snapshot-clean/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();

export async function POST(request: NextRequest) {
  try {
    // Cookie認証確認
    const cookieStore = cookies();
    const authCookie = cookieStore.get('finance-auth');
    
    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // リクエストボディから日付を取得
    const body = await request.json();
    const { month } = body;
    
    if (!month) {
      return NextResponse.json(
        { error: 'Month parameter is required' },
        { status: 400 }
      );
    }

    // Supabaseクライアント作成
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // bs_snapshot_clean関数を実行
    const { data, error } = await supabase.rpc('bs_snapshot_clean', {
      p_month: month
    });

    if (error) {
      console.error('bs_snapshot_clean error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data: data || []
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // GETリクエストの場合もPOSTと同様の処理（必要に応じて）
  const searchParams = request.nextUrl.searchParams;
  const month = searchParams.get('month');
  
  if (!month) {
    return NextResponse.json(
      { error: 'Month parameter is required' },
      { status: 400 }
    );
  }

  // Cookie認証確認
  const cookieStore = cookies();
  const authCookie = cookieStore.get('finance-auth');
  
  if (!authCookie || authCookie.value !== 'authenticated') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase.rpc('bs_snapshot_clean', {
    p_month: month
  });

  if (error) {
    console.error('bs_snapshot_clean error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ 
    success: true, 
    data: data || []
  });
}
