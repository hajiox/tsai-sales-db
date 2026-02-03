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
  props: { params: Promise<{ id: string }> }
) {
  // 1. Log raw props to see what we're receiving
  console.log('[API PUT] Raw props:', JSON.stringify(props, null, 2))

  const params = await props.params;
  console.log('[API PUT] Resolved params:', JSON.stringify(params, null, 2))

  try {
    const { id } = params
    console.log(`[API PUT] Extracted ID: "${id}", typeof: ${typeof id}`)

    if (!id || id === 'undefined' || id.trim() === 'undefined') {
      console.error(`[API PUT] Invalid ID caught: "${id}"`)
      return NextResponse.json(
        { error: '無効なIDです (undefined)' },
        { status: 400 }
      )
    }

    const body = await request.json()
    console.log('[API PUT] Request body:', JSON.stringify(body, null, 2))

    const { url, title, description, og_image, memo, sort_order } = body

    console.log(`[API PUT] About to update with ID: "${id}"`)
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
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
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
