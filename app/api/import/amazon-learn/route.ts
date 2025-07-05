// /app/api/import/amazon-learn/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const { amazonTitle, productId } = await request.json();

    // 入力検証
    if (!amazonTitle || !productId) {
      return NextResponse.json(
        { success: false, error: 'Amazon商品名と商品IDは必須です' },
        { status: 400 }
      );
    }

    // 学習データを保存（upsert）
    const { data, error } = await supabase
      .from('amazon_product_mapping')
      .upsert(
        {
          amazon_title: amazonTitle,
          product_id: productId,
        },
        {
          onConflict: 'amazon_title', // ユニーク制約に基づいてupsert
        }
      );

    if (error) {
      console.error('学習データ保存エラー:', error);
      throw new Error('学習データの保存に失敗しました');
    }

    return NextResponse.json({
      success: true,
      message: '学習データを保存しました',
    });

  } catch (error) {
    console.error('Amazon学習APIエラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '学習処理中にエラーが発生しました' 
      },
      { status: 500 }
    );
  }
}
