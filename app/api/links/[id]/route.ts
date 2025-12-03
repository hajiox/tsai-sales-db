// /app/api/links/[id]/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// リンク更新
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { url, title, description, og_image, memo, sort_order } = body

    const { data, error } = await supabase
      .from('company_links')
      .update({
        url,
        title,
        description,
        og_image,
        memo,
        sort_order,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('リンク更新エラー:', error)
      return NextResponse.json(
        { error: 'リンクの更新に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('リンク更新エラー:', error)
    return NextResponse.json(
      { error: 'リンクの更新に失敗しました' },
      { status: 500 }
    )
  }
}

// リンク削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { error } = await supabase
      .from('company_links')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('リンク削除エラー:', error)
      return NextResponse.json(
        { error: 'リンクの削除に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('リンク削除エラー:', error)
    return NextResponse.json(
      { error: 'リンクの削除に失敗しました' },
      { status: 500 }
    )
  }
}
