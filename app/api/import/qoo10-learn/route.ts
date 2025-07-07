// /app/api/import/qoo10-learn/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // 重要: 書き込み権限のためSERVICE_ROLE_KEYを使用
);

export const dynamic = 'force-dynamic';

interface LearnRequest {
  qoo10Title: string;
  productId: string;
}

export async function POST(request: NextRequest) {
  console.log('🔍 Qoo10学習API開始 - ver.1');
  
  try {
    const body: LearnRequest = await request.json();
    console.log('受信データ:', JSON.stringify(body, null, 2));
    
    const { qoo10Title, productId } = body;

    // バリデーション
    if (!qoo10Title || typeof qoo10Title !== 'string' || qoo10Title.trim().length === 0) {
      console.error('Qoo10商品名が不正:', qoo10Title);
      return NextResponse.json(
        { success: false, error: 'Qoo10商品名が不正です' },
        { status: 400 }
      );
    }

    if (!productId || typeof productId !== 'string' || productId.trim().length === 0) {
      console.error('商品IDが不正:', productId);
      return NextResponse.json(
        { success: false, error: '商品IDが不正です' },
        { status: 400 }
      );
    }

    // 学習データの保存（upsert）
    console.log(`📚 Qoo10学習データ保存: ${qoo10Title} -> ${productId}`);
    
    const { data, error } = await supabase
      .from('qoo10_product_mapping')
      .upsert({ 
        qoo10_title: qoo10Title.trim(), 
        product_id: productId.trim() 
      }, { 
        onConflict: 'qoo10_title'  // PRIMARY KEY制約のため
      });

    if (error) {
      console.error('Qoo10学習データ保存エラー:', error);
      return NextResponse.json(
        { success: false, error: `学習データの保存に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    console.log('✅ Qoo10学習データ保存成功');
    
    return NextResponse.json({
      success: true,
      message: 'Qoo10学習データを保存しました',
      data: { qoo10Title, productId }
    });

  } catch (error) {
    console.error('❌ Qoo10学習API エラー:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました: ' + (error instanceof Error ? error.message : '不明なエラー') },
      { status: 500 }
    );
  }
}
