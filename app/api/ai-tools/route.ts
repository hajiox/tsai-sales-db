// /app/api/ai-tools/route.ts ver.2
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET: 一覧取得
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('ai_tools')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('AI Tools GET error:', error);
    return NextResponse.json(
      { error: 'データの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: 新規追加
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, name, login_method, account, password, memo } = body;

    const { data, error } = await supabase
      .from('ai_tools')
      .insert({
        url,
        name,
        login_method: login_method || 'google',
        account,
        password,
        memo,
        ai_description: null
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('AI Tools POST error:', error);
    return NextResponse.json(
      { error: 'データの追加に失敗しました' },
      { status: 500 }
    );
  }
}
