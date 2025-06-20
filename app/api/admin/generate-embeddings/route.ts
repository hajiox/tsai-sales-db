// /app/api/admin/generate-embeddings/route.ts ver.1
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const BATCH_SIZE = 500; // 一度に処理する件数

export async function GET() {
  try {
    // 1. まだベクトル化されていない商品を取得
    const { data: products, error: fetchError } = await supabase
      .from('products')
      .select('id, name')
      .is('embedding', null); // embeddingが設定されていないもののみ対象

    if (fetchError) {
      throw new Error(`商品データの取得に失敗: ${fetchError.message}`);
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ message: 'すべての商品のベクトル化が完了しています。' });
    }

    let totalProcessed = 0;

    // 2. バッチ処理でベクトル化とDB保存を実行
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      const productNames = batch.map(p => p.name);

      // OpenAIのAPIで商品名をベクトルに変換
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: productNames,
      });

      // DBに保存する形式に整形
      const updates = batch.map((product, index) => ({
        id: product.id,
        embedding: embeddingResponse.data[index].embedding,
      }));

      // Supabaseにupsertで保存
      const { error: upsertError } = await supabase
        .from('products')
        .upsert(updates);

      if (upsertError) {
        throw new Error(`バッチ ${i / BATCH_SIZE + 1} の保存に失敗: ${upsertError.message}`);
      }
      totalProcessed += batch.length;
    }

    return NextResponse.json({
      message: `成功: ${totalProcessed}件の商品名のベクトル化と保存が完了しました。`,
    });

  } catch (error) {
    console.error('ベクトル生成APIエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'サーバー内部でエラーが発生しました。';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
