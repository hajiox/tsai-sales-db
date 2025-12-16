// /app/api/links/route.ts ver.2
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: リンク一覧取得
export async function GET() {
  const { data, error } = await supabase
    .from('company_links')
    .select('*')
    // 数値が小さい順（昇順）で表示。これにより sort_order=1 が一番上に来ます
    .order('sort_order', { ascending: true })
    // sort_orderが同じ場合は作成日時順（念の為のフォールバック）
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST: リンク追加
export async function POST(request: NextRequest) {
  const { url, title, description, og_image, memo } = await request.json()

  // 1. 現在の「最小の」sort_orderを取得（リストの一番上の数値）
  const { data: minData } = await supabase
    .from('company_links')
    .select('sort_order')
    .order('sort_order', { ascending: true })
    .limit(1)
    .single()

  // 2. 新しいリンクには「最小値 - 1」を設定して、確実に一番上に表示させる
  // データが空（初回）の場合は 1 とする
  const currentMin = minData ? minData.sort_order : 1
  const newSortOrder = currentMin - 1

  // 3. データ挿入
  const { data, error } = await supabase
    .from('company_links')
    .insert({ 
      url, 
      title, 
      description, 
      og_image, 
      memo, 
      sort_order: newSortOrder // 計算した順序値をセット
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
