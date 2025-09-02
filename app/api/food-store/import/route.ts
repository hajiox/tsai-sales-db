// /app/api/food-store/import/route.ts ver.5
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  console.log('API Route called')
  
  try {
    const body = await request.json()
    console.log('Request body received:', { 
      dataLength: body.data?.length,
      firstItem: body.data?.[0]
    })

    const { data } = body

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: '有効なデータが見つかりませんでした' },
        { status: 400 }
      )
    }

    const supabase = createRouteHandlerClient({ cookies })

    // 認証状態を確認
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    if (authError) {
      console.error('Auth error:', authError)
      return NextResponse.json(
        { error: '認証エラーが発生しました', details: authError.message },
        { status: 401 }
      )
    }

    // report_monthを最初のデータから取得
    const reportMonth = data[0]?.report_month
    if (!reportMonth) {
      return NextResponse.json(
        { error: 'レポート月が指定されていません' },
        { status: 400 }
      )
    }

    // 既存データの削除 - まず存在確認
    console.log('Checking existing data for:', reportMonth)
    const { data: existingData, error: checkError } = await supabase
      .from('food_store_sales')
      .select('id')
      .eq('report_month', reportMonth)
      .limit(1)

    if (checkError) {
      console.error('Check error:', checkError)
      // エラーがあっても続行を試みる
    }

    if (existingData && existingData.length > 0) {
      console.log('Deleting existing data for:', reportMonth)
      const { error: deleteError } = await supabase
        .from('food_store_sales')
        .delete()
        .eq('report_month', reportMonth)

      if (deleteError) {
        console.error('Delete error details:', {
          message: deleteError.message,
          details: deleteError.details,
          hint: deleteError.hint,
          code: deleteError.code
        })
        
        // 削除エラーでも新規挿入を試みる
        console.log('Delete failed, but attempting to continue with insert...')
      }
    }

    // 新規データの挿入（category_idを含む）
    console.log('Inserting new data:', data.length, 'records')
    
    // データを小さなバッチに分割して挿入（大量データ対策）
    const batchSize = 100
    let insertedCount = 0
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize)
      const { error: insertError } = await supabase
        .from('food_store_sales')
        .insert(batch)

      if (insertError) {
        console.error('Insert error at batch', i / batchSize, ':', {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code
        })
        
        return NextResponse.json(
          { 
            error: 'データの登録に失敗しました', 
            details: insertError.message,
            insertedCount: insertedCount 
          },
          { status: 500 }
        )
      }
      
      insertedCount += batch.length
    }

    console.log('Successfully inserted', insertedCount, 'records')

    return NextResponse.json({ 
      success: true, 
      count: insertedCount 
    })

  } catch (error: any) {
    console.error('Import error:', error)
    return NextResponse.json(
      { 
        error: 'サーバーエラーが発生しました', 
        details: error?.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    )
  }
}

// デバッグ用にGETメソッドも追加
export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  
  return NextResponse.json({ 
    message: 'Food Store Import API is working',
    authenticated: !!session,
    timestamp: new Date().toISOString()
  })
}
