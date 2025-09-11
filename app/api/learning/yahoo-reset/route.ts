// /app/api/learning/yahoo-reset/route.ts ver.1
// Yahoo学習データリセットAPI（Amazon/楽天パターン統一）

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase直接初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
);

export async function POST() {
  try {
    console.log('=== Yahoo学習データリセット開始 ===');

    // yahoo_product_mappingテーブルの全データを削除
    const { error, count } = await supabase
      .from('yahoo_product_mapping')
      .delete()
      .neq('yahoo_title', ''); // 全レコード削除のための条件

    if (error) {
      console.error('Yahoo学習データ削除エラー:', error);
      throw new Error('学習データの削除に失敗しました');
    }

    const deletedCount = count || 0;
    console.log(`Yahoo学習データリセット完了: ${deletedCount}件削除`);

    return NextResponse.json({
      success: true,
      message: `Yahoo学習データをリセットしました（${deletedCount}件削除）`,
      deletedCount
    });

  } catch (error) {
    console.error('Yahoo学習データリセット処理エラー:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : '学習データリセット処理でエラーが発生しました' 
    }, { status: 500 });
  }
}
