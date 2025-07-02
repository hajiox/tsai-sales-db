// /app/api/learning/csv-reset/route.ts ver.1
// 汎用CSV学習データリセットAPI

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    console.log("CSV学習データリセット API called")

    // csv_product_mappingテーブルの全データを削除
    const { error: deleteError, count } = await supabase
      .from('csv_product_mapping')
      .delete()
      .neq('csv_title', 'dummy_never_match') // 全削除のためのダミー条件

    if (deleteError) {
      console.error('CSV学習データ削除エラー:', deleteError)
      return NextResponse.json({ 
        success: false, 
        error: 'CSV学習データの削除に失敗しました',
        details: deleteError.message 
      }, { status: 500 })
    }

    const deletedCount = count || 0
    console.log(`CSV学習データリセット完了: ${deletedCount}件削除`)

    return NextResponse.json({
      success: true,
      message: 'CSV学習データをリセットしました',
      deletedCount: deletedCount
    })

  } catch (error) {
    console.error('CSV学習データリセットAPI エラー:', error)
    return NextResponse.json({ 
      success: false,
      error: 'CSV学習データリセット中にエラーが発生しました',
      details: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 })
  }
}
