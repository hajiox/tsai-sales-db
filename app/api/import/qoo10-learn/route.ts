// /app/api/import/qoo10-learn/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 書き込み権限のあるSERVICE_ROLE_KEYを使用
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await request.json();
    const { qoo10Title, productId } = body;

    // バリデーション
    if (!qoo10Title || !productId) {
      return NextResponse.json(
        { success: false, error: '必須パラメータ(qoo10Title, productId)が不足しています。' },
        { status: 400 }
      );
    }
    
    console.log(`📚 Qoo10個別学習開始: 「${qoo10Title}」->「${productId}」`);

    // qoo10_product_mappingテーブルの主キーはqoo10_titleなので、
    // upsertは自動的に「存在すれば更新、なければ挿入」を実行します。
    const { data, error } = await supabase
      .from('qoo10_product_mapping')
      .upsert({
        qoo10_title: qoo10Title,
        product_id: productId,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Qoo10学習データ保存エラー:', error);
      return NextResponse.json(
        { success: false, error: `DBエラー: ${error.message}` },
        { status: 500 }
      );
    }

    console.log('✅ Qoo10個別学習成功:', data);
    return NextResponse.json({
      success: true,
      message: '学習データを保存しました。',
      data: data,
    });

  } catch (err) {
    const error = err as Error;
    console.error('❌ Qoo10個別学習APIで予期せぬエラー:', error);
    return NextResponse.json(
      { success: false, error: `サーバーエラー: ${error.message}` },
      { status: 500 }
    );
  }
}
