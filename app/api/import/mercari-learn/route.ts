// /app/api/import/mercari-learn/route.ts ver.2
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// サービスロールキーを使用（重要！）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    console.log('メルカリ学習データ保存開始:', { mercariTitle, productId });

    // 学習データの保存（upsert）
    // メルカリはPRIMARY KEY方式なので、onConflictは不要
    const { data, error } = await supabase
      .from('mercari_product_mapping')
      .upsert({
        mercari_title: mercariTitle,
        product_id: productId,
        created_at: new Date().toISOString()
      })
      .select(); // 保存されたデータを返す

    if (error) {
      console.error('メルカリ学習データ保存エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('メルカリ学習データ保存成功:', data);

    return NextResponse.json({
      success: true,
      message: '学習データを保存しました',
      data: data
    });

  } catch (error) {
    console.error('メルカリ個別学習APIエラー:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
