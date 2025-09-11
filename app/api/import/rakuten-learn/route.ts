// /app/api/import/rakuten-learn/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set"); })();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rakutenTitle, productId } = body;

    // バリデーション
    if (!rakutenTitle || !productId) {
      return NextResponse.json(
        { success: false, error: '必須パラメータが不足しています' },
        { status: 400 }
      );
    }

    // Supabaseクライアントの初期化
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 学習データの保存（upsert）
    const { data, error } = await supabase
      .from('rakuten_product_mapping')
      .upsert(
        {
          rakuten_title: rakutenTitle,
          product_id: productId,
          created_at: new Date().toISOString()
        },
        {
          onConflict: 'rakuten_title'
        }
      );

    if (error) {
      console.error('楽天学習データ保存エラー:', error);
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
    console.error('楽天個別学習APIエラー:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
