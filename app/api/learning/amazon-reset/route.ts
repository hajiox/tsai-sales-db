// /app/api/learning/amazon-reset/route.ts ver.2 (修正版)
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "../../../../lib/supabase"

export async function POST(request: NextRequest) {
  try {
    console.log('Amazon学習データリセット開始')

    // 🔥 まずテーブルの存在確認
    const { data: tableCheck, error: tableError } = await supabase
      .from('amazon_product_mapping')
      .select('count(*)')
      .limit(1)

    if (tableError) {
      console.error('テーブル存在確認エラー:', tableError)
      return NextResponse.json(
        { 
          success: false, 
          error: 'amazon_product_mappingテーブルが見つかりません',
          details: tableError.message
        },
        { status: 500 }
      )
    }

    // 🔥 全行削除（最も確実な方法）
    const { data, error } = await supabase
      .from('amazon_product_mapping')
      .delete()
      .neq('id', -999999) // 存在しないIDで条件指定（実質全行削除）

    if (error) {
      console.error('学習データ削除エラー:', error)
      return NextResponse.json(
        { 
          success: false, 
          error: '学習データの削除に失敗しました',
          details: error.message
        },
        { status: 500 }
      )
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
