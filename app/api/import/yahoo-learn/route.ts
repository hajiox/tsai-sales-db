// /app/api/import/yahoo-learn/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { yahooTitle, productId } = body;

    // バリデーション
    if (!yahooTitle || !productId) {
      return NextResponse.json(
        { success: false, error: '必須パラメータが不足しています' },
        { status: 400 }
      );
    }

    // Supabaseクライアントの初期化
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 学習データの保存（upsert）
    const { data, error } = await supabase
      .from('yahoo_product_mapping')
      .upsert(
        {
          yahoo_title: yahooTitle,
          product_id: productId,
          created_at: new Date().toISOString()
        },
        {
          onConflict: 'yahoo_title'
        }
      );

    if (error) {
      console.error('Yahoo学習データ保存エラー:', error);
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
    console.error('Yahoo個別学習APIエラー:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
