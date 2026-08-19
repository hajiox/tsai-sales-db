// /app/api/import/yahoo-learn/route.ts ver.2
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 権限問題を解決するため、ANON_KEYからSERVICE_ROLE_KEYに変更
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();

export async function POST(request: NextRequest) {
  // Supabaseクライアントを関数スコープ内で初期化
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await request.json();
    const { yahooTitle, productId } = body;

    // バリデーションを強化
    if (!yahooTitle || !productId) {
      console.warn('Yahoo個別学習API: 必須パラメータ(yahooTitle, productId)が不足しています。', { body });
      return NextResponse.json(
        { success: false, error: '必須パラメータが不足しています' },
        { status: 400 }
      );
    }
    
    console.log(`📚 Yahoo個別学習処理を開始します: 「${yahooTitle}」を商品ID「${productId}」に紐付けます。`);

    // 学習データを保存（upsert）
    // onConflictでyahoo_titleが競合した場合、product_idを更新する
    const { data, error } = await supabase
      .from('yahoo_product_mapping')
      .upsert(
        {
          yahoo_title: yahooTitle,
          product_id: productId,
        },
        {
          onConflict: 'yahoo_title', // DBのUNIQUE制約カラム
        }
      )
      .select() // 成功時に更新/挿入したデータを返す
      .single(); // 1件のデータが返ることを期待

    if (error) {
      console.error('❌ Yahoo学習データ保存時にDBエラーが発生しました:', error);
      return NextResponse.json(
        { success: false, error: `学習データの保存に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    console.log('✅ Yahoo個別学習が正常に完了しました:', data);
    return NextResponse.json({
      success: true,
      message: '学習データを正常に保存しました。',
      data: data,
    });

  } catch (err) {
    const error = err as Error;
    console.error('❌ Yahoo個別学習APIで予期せぬサーバーエラーが発生しました:', error);
    return NextResponse.json(
      { success: false, error: `サーバーエラーが発生しました: ${error.message}` },
      { status: 500 }
    );
  }
}
