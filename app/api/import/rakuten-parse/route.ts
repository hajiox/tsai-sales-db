import { NextRequest, NextResponse } from 'next/server'
import { parseCsvText, findBestMatchSimplified } from '@/lib/csvHelpers'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createAuthenticatedSupabaseClient()
  const { csvText, reportMonth } = await req.json()
  const parsed = parseCsvText(csvText)

  const { data: products, error } = await supabase
    .from('web_sales_products')
    .select('*')

  if (error || !products) {
    console.error('DB取得エラー:', error)
    return NextResponse.json({ error: 'DB取得に失敗しました' }, { status: 500 })
  }

  const result = parsed.map((item) => {
    const bestMatch = findBestMatchSimplified(item.name, products)
    return {
      ...item,
      matched_product_id: bestMatch?.product_id || null,
      matched_name: bestMatch?.name || null,
      match_score: bestMatch?.score || 0,
      report_month: reportMonth,
    }
  })

  return NextResponse.json(result)
}
