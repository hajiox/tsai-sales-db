// /app/api/learning/amazon-reset/route.ts ver.1
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "../../../../lib/supabase"

export async function POST(request: NextRequest) {
  try {
    console.log('Amazon学習データリセット開始')

    // Amazon学習データテーブルを全削除
    const { data, error } = await supabase
      .from('amazon_product_mapping')
      .delete()
      .neq('id', 'dummy') // 全行削除（dummy条件で全削除）

    if (error) {
      console.error('学習データ削除エラー:', error)
      throw error
    }

    console.log('Amazon学習データリセット完了:', data)

    return NextResponse.json({
      success: true,
      message: 'Amazon学習データをリセットしました',
      deletedCount: data?.length || 0
    })

  } catch (error) {
    console.error('学習データリセットエラー:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Amazon学習データのリセットに失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
