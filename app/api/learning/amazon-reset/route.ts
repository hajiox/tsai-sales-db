// /app/api/learning/amazon-reset/route.ts ver.2 (修正版)
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "../../../../lib/supabase"

export async function POST(request: NextRequest) {
  try {
    console.log('Amazon学習データリセット開始')

    // 🔥 まずテーブルの存在とデータ確認
    const { data: existingData, error: selectError } = await supabase
      .from('amazon_product_mapping')
      .select('*')
      .limit(5)

    if (selectError) {
      console.error('テーブル確認エラー:', selectError)
      return NextResponse.json(
        { 
          success: false, 
          error: `テーブルアクセスエラー: ${selectError.message}`,
          details: 'amazon_product_mappingテーブルが存在しないか、アクセス権限がありません'
        },
        { status: 500 }
      )
    }

    console.log('既存データ確認:', existingData?.length || 0, '件')

    if (!existingData || existingData.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Amazon学習データは既に空です',
        deletedCount: 0
      })
    }

    // 🔥 既存データがある場合は削除実行
    const { data, error } = await supabase
      .from('amazon_product_mapping')
      .delete()
      .in('id', existingData.map(item => item.id)) // 存在するIDのみ削除

    if (error) {
      console.error('学習データ削除エラー:', error)
      return NextResponse.json(
        { 
          success: false, 
          error: `削除処理エラー: ${error.message}`,
          details: error.details || 'データ削除に失敗しました'
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
