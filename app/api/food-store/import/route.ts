
// /app/api/food-store/import/route.ts ver.6
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  console.log('API Route called: /api/food-store/import')

  try {
    const body = await request.json()
    console.log('Request body received with length:', body.data?.length)

    const { data } = body

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: '有効なデータが見つかりませんでした' },
        { status: 400 }
      )
    }

    console.log('Initializing Supabase client...')
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch (error) {
              // Ignored in Route Handlers
            }
          },
        },
      }
    )

    // 認証状態を確認
    console.log('Checking auth user...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('Auth error or no user:', authError)
      return NextResponse.json(
        { error: '認証エラーが発生しました', details: authError?.message },
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

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { } }
      }
    }
  )
  const { data: { user } } = await supabase.auth.getUser()

  return NextResponse.json({
    message: 'Food Store Import API is working',
    authenticated: !!user,
    timestamp: new Date().toISOString()
  })
}
