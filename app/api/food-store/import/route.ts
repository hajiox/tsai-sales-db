// /app/api/food-store/import/route.ts ver.4
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  console.log('API Route called')
  
  try {
    const body = await request.json()
    console.log('Request body received:', { 
      dataLength: body.data?.length
    })

    const { data } = body

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: '有効なデータが見つかりませんでした' },
        { status: 400 }
      )
    }

    const supabase = createRouteHandlerClient({ cookies })

    // report_monthを最初のデータから取得
    const reportMonth = data[0]?.report_month
    if (!reportMonth) {
      return NextResponse.json(
        { error: 'レポート月が指定されていません' },
        { status: 400 }
      )
    }

    // 既存データの削除
    console.log('Deleting existing data for:', reportMonth)
    const { error: deleteError } = await supabase
      .from('food_store_sales')
      .delete()
      .eq('report_month', reportMonth)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json(
        { error: '既存データの削除に失敗しました', details: deleteError.message },
        { status: 500 }
      )
    }

    // 新規データの挿入（category_idを含む）
    console.log('Inserting new data:', data.length, 'records')
    const { error: insertError } = await supabase
      .from('food_store_sales')
      .insert(data)

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json(
        { error: 'データの登録に失敗しました', details: insertError.message },
        { status: 500 }
      )
    }

    // 注意: 商品マスターの更新は、CSVインポートモーダル側で
    // 新規商品のみを追加するように変更済みのため、ここでは行わない
    // （カテゴリー情報を保持するため）

    return NextResponse.json({ 
      success: true, 
      count: data.length 
    })

  } catch (error: any) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}

// デバッグ用にGETメソッドも追加
export async function GET() {
  return NextResponse.json({ message: 'Food Store Import API is working' })
}
