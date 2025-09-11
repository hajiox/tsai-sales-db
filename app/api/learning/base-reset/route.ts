// /app/api/learning/base-reset/route.ts ver.1

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
);

interface ResetResult {
  success: boolean;
  deletedCount: number;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ResetResult>> {
  try {
    // BASE学習データを全削除
    const { data, error, count } = await supabase
      .from('base_product_mapping')
      .delete()
      .neq('base_title', 'dummy_never_match'); // 全件削除のためのダミー条件

    if (error) {
      console.error('BASE学習データ削除エラー:', error);
      return NextResponse.json({
        success: false,
        deletedCount: 0,
        error: `削除処理エラー: ${error.message}`
      });
    }

    console.log('BASE学習データリセット完了:', count || 0, '件削除');

    return NextResponse.json({
      success: true,
      deletedCount: count || 0
    });

  } catch (error) {
    console.error('BASE学習データリセット処理エラー:', error);
    return NextResponse.json({
      success: false,
      deletedCount: 0,
      error: error instanceof Error ? error.message : '不明なエラー'
    });
  }
}
