// /app/api/admin/generate-embeddings/route.ts ver.2
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  throw new Error('OPENAI_API_KEY is not set');
}
const openai = new OpenAI({
  apiKey: openaiApiKey,
});

const BATCH_SIZE = 500;

export async function GET() {
  try {
    // 1. [MODIFIED] ベクトル化されておらず、かつ商品名が空でない商品を取得
    const { data: products, error: fetchError } = await supabase
      .from('products')
      .select('id, name')
      .is('embedding', null)     // embeddingが設定されていない
      .not('name', 'is', null);  // ★★★ nameがNULLではないことを保証する

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
      // filter(p => p.name) を追加して、万が一空文字列が来ても除外する
      const productNames = batch.map(p => p.name).filter(p => p.name);

      if (productNames.length === 0) {
          continue; // このバッチに有効な名前がなければスキップ
      }

      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: productNames,
      });

      const updates = batch.map((product, index) => ({
        id: product.id,
        embedding: embeddingResponse.data[index].embedding,
      }));

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
