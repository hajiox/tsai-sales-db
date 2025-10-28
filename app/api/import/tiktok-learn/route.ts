// app/api/import/tiktok-learn/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { title, productId } = await request.json();

    if (!title || !productId) {
      return NextResponse.json({ 
        error: 'タイトルと商品IDが必要です' 
      }, { status: 400 });
    }

    console.log(`[TikTok Learn] 学習開始: "${title}" -> ${productId}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // tiktok_product_mappingに保存（upsert）
    const { data, error } = await supabase
      .from('tiktok_product_mapping')
      .upsert({
        tiktok_product_name: title,
        product_id: productId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'tiktok_product_name'
      })
      .select();

    if (error) {
      console.error('[TikTok Learn] 保存エラー:', error);
      return NextResponse.json({
        error: '学習データの保存に失敗しました',
        details: error.message
      }, { status: 500 });
    }

    console.log(`[TikTok Learn] 学習完了:`, data);

    return NextResponse.json({
      success: true,
      message: '学習が完了しました',
      data: data?.[0] || null
    });

  } catch (error) {
    console.error('[TikTok Learn] エラー:', error);
    return NextResponse.json({
      error: '学習中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
