// /app/api/import/base-learn/route.ts ver.3
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// サービスロールキーを使用（重要！）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { baseTitle, productId } = body;

    // バリデーション
    if (!baseTitle || !productId) {
      return NextResponse.json(
        { success: false, error: '必須パラメータが不足しています' },
        { status: 400 }
      );
    }

    console.log('BASE学習データ保存開始:', { baseTitle, productId });

    // PRIMARY KEY制約の場合、既存データは削除してから再挿入
    // または、created_atを強制更新
    const { data, error } = await supabase
      .from('base_product_mapping')
      .upsert({
        base_title: baseTitle,
        product_id: productId,
        created_at: new Date().toISOString()  // 常に現在時刻で更新
      }, {
        onConflict: 'base_title',  // 明示的に指定
        ignoreDuplicates: false     // 重複を無視しない = 更新する
      })
      .select();

    if (error) {
      console.error('BASE学習データ保存エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('BASE学習データ保存成功:', data);

    return NextResponse.json({
      success: true,
      message: '学習データを保存しました',
      data: data
    });

  } catch (error) {
    console.error('BASE個別学習APIエラー:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
