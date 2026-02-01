// /app/api/ai-tools/[id]/route.ts ver.2
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  (() => {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  })();
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  (() => {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  })();

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// PUT: 更新
export async function PUT(
  request: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { id } = await Promise.resolve(params);
    if (!id) {
      return NextResponse.json(
        { error: 'IDが指定されていません' },
        { status: 400 }
      );
    }
    const body = await request.json();
    const { url, name, login_method, account, password, memo, ai_description } = body;

    const { data, error } = await supabase
      .from('ai_tools')
      .update({
        url,
        name,
        login_method,
        account,
        password,
        memo,
        ai_description
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('AI Tools PUT error:', error);
    return NextResponse.json(
      { error: 'データの更新に失敗しました' },
      { status: 500 }
    );
  }
}

// DELETE: 削除
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const { id } = await Promise.resolve(params);
    if (!id) {
      return NextResponse.json(
        { error: 'IDが指定されていません' },
        { status: 400 }
      );
    }
    const { error } = await supabase
      .from('ai_tools')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('AI Tools DELETE error:', error);
    return NextResponse.json(
      { error: 'データの削除に失敗しました' },
      { status: 500 }
    );
  }
}
