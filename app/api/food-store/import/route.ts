
// /app/api/food-store/import/route.ts ver.7
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getToken } from 'next-auth/jwt'

export async function POST(request: NextRequest) {
  console.log('API Route called: /api/food-store/import')

  try {
    // 1. Next-Authによる認証チェック
    console.log('Checking NextAuth session...')
    const token = await getToken({ req: request })

    // middleware.tsのロジックに合わせる (email check is optional if middleware enforces it, but good for safety)
    const isAuthenticated = !!token

    if (!isAuthenticated) {
      console.error('NextAuth token missing')
      return NextResponse.json(
        { error: '認証エラーが発生しました', details: 'No valid session' },
        { status: 401 }
      )
    }
    console.log('User authenticated via NextAuth:', token.email)

    const body = await request.json()
    console.log('Request body received with length:', body.data?.length)

    const { data } = body

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: '有効なデータが見つかりませんでした' },
        { status: 400 }
      )
    }

    console.log('Initializing Supabase Admin client...')
    // Adminクライアント (Service Role) を使用してDB操作を行う (RLSをバイパス)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

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
    }

    if (existingData && existingData.length > 0) {
      console.log('Deleting existing data for:', reportMonth)
      const { error: deleteError } = await supabase
        .from('food_store_sales')
        .delete()
        .eq('report_month', reportMonth)

      if (deleteError) {
        console.error('Delete error details:', deleteError)
      }
    }

    // 新規データの挿入
    console.log('Inserting new data:', data.length, 'records')

    // バッチ処理
    const batchSize = 100
    let insertedCount = 0

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize)
      console.log(`Inserting batch ${i} - ${i + batch.length}`)

      const { error: insertError } = await supabase
        .from('food_store_sales')
        .insert(batch)

      if (insertError) {
        console.error('Insert error at batch', i, ':', insertError)
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
    console.error('Import error (Critical):', error)
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

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  return NextResponse.json({
    message: 'Food Store Import API is working (NextAuth Mode)',
    authenticated: !!token,
    user: token?.email,
    timestamp: new Date().toISOString()
  })
}
