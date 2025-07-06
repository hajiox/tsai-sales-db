// /app/api/import/mercari-learn/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mercariTitle, productId } = body;

    // バリデーション
    if (!mercariTitle || !productId) {
      return NextResponse.json(
        { success: false, error: '必須パラメータが不足しています' },
        { status: 400 }
      );
    }

    // Supabaseクライアントの初期化
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 学習データの保存（upsert）
    // メルカリはPRIMARY KEY方式なので、onConflictは不要
    const { data, error } = await supabase
      .from('mercari_product_mapping')
      .upsert({
        mercari_title: mercariTitle,
        product_id: productId,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('メルカリ学習データ保存エラー:', error);
      return NextResponse.json(
        { success: false, error: '学習データの保存に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '学習データを保存しました'
    });

  } catch (error) {
    console.error('メルカリ個別学習APIエラー:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
