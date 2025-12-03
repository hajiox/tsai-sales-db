// /app/api/links/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// リンク一覧取得
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('company_links')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('リンク取得エラー:', error)
      return NextResponse.json(
        { error: 'リンクの取得に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('リンク取得エラー:', error)
    return NextResponse.json(
      { error: 'リンクの取得に失敗しました' },
      { status: 500 }
    )
  }
}

// リンク追加
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, title, description, og_image, memo, sort_order } = body

    if (!url) {
      return NextResponse.json(
        { error: 'URLは必須です' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('company_links')
      .insert({
        url,
        title: title || null,
        description: description || null,
        og_image: og_image || null,
        memo: memo || null,
        sort_order: sort_order || 0,
      })
      .select()
      .single()

    if (error) {
      console.error('リンク追加エラー:', error)
      return NextResponse.json(
        { error: 'リンクの追加に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('リンク追加エラー:', error)
    return NextResponse.json(
      { error: 'リンクの追加に失敗しました' },
      { status: 500 }
    )
  }
}
