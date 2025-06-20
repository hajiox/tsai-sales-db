// /lib/db/productMatcher.ts
// ver1 (ベクトル検索を実行する関数) - updated
import { createClient } from '@supabase/supabase-js';

// Supabaseクライアントを初期化
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase credentials are not defined');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 複数の商品名を元に、Supabase DBの `match_products` 関数を呼び出して
 * ベクトル検索を行い、類似する商品を検索する。
 * @param productNames - 検索したい商品名の文字列の配列
 * @returns - マッチした商品情報の配列
 */
export async function matchProducts(productNames: string[]) {
  // SupabaseのRPC（Remote Procedure Call）でDB関数を呼び出す
  const { data, error } = await supabase.rpc('match_products', {
    // DB関数の引数 'query_texts' に商品名配列を渡す
    query_texts: productNames,
    // DB関数の引数 'match_threshold' に類似度の閾値を渡す
    match_threshold: 0.5, // 類似度の閾値（0.0〜1.0）。値が大きいほど厳密な一致を求める。
    // DB関数の引数 'match_count' に取得件数を渡す
    match_count: 1, // 各商品名に最も類似する商品を1件取得する
  });

  if (error) {
    console.error('Error in matchProducts RPC:', error);
    throw new Error(`Failed to match products: ${error.message}`);
  }

  // データがnullや空配列の場合も考慮して空配列を返す
  return data || [];
}
