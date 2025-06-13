import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const formatCurrency = (n: number) =>
  `${new Intl.NumberFormat('ja-JP').format(n)}円`

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    if (!url || !key) throw new Error('env_missing')
    const supabase = createClient(url, key)

    const { data: latest, error } = await supabase
      .from('daily_sales_report')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (error) throw new Error(error.message)
    if (!latest) throw new Error('no_data')

    const date = latest.date as string
    const month = date.slice(0, 7)
    const { data: monthData, error: monthError } = await supabase
      .from('daily_sales_report')
      .select(
        'amazon_amount, base_amount, yahoo_amount, mercari_amount, rakuten_amount, qoo10_amount, floor_sales'
      )
      .gte('date', `${month}-01`)
      .lte('date', date)

    if (monthError) throw new Error(monthError.message)

    const totals = (monthData || []).reduce(
      (acc, row) => {
        acc.amazon += row.amazon_amount || 0
        acc.base += row.base_amount || 0
        acc.yahoo += row.yahoo_amount || 0
        acc.mercari += row.mercari_amount || 0
        acc.rakuten += row.rakuten_amount || 0
        acc.qoo10 += row.qoo10_amount || 0
        acc.floor += row.floor_sales || 0
        return acc
      },
      { amazon: 0, base: 0, yahoo: 0, mercari: 0, rakuten: 0, qoo10: 0, floor: 0 }
    )

    const reportLines = [
      '【会津ブランド館売上報告】',
      date,
      `フロア日計 / ${formatCurrency(latest.floor_sales)}`,
      `フロア累計 / ${formatCurrency(latest.floor_total)}`,
      `入 金 / ${formatCurrency(latest.cash_income)}`,
      `レジ通過人数 / ${latest.register_count} 人`,
      '【WEB売上】',
      `Amazon 売上 / ${latest.amazon_count}件 ${formatCurrency(latest.amazon_amount)}`,
      `BASE 売上 / ${latest.base_count}件 ${formatCurrency(latest.base_amount)}`,
      `Yahoo! 売上 / ${latest.yahoo_count}件 ${formatCurrency(latest.yahoo_amount)}`,
      `メルカリ 売上 / ${latest.mercari_count}件 ${formatCurrency(latest.mercari_amount)}`,
      `楽天 売上 / ${latest.rakuten_count}件 ${formatCurrency(latest.rakuten_amount)}`,
      `Qoo10 売上 / ${latest.qoo10_count}件 ${formatCurrency(latest.qoo10_amount)}`,
      `Amazon累計 / ${formatCurrency(totals.amazon)}`,
      `BASE累計 / ${formatCurrency(totals.base)}`,
      `Yahoo!累計 / ${formatCurrency(totals.yahoo)}`,
      `メルカリ累計 / ${formatCurrency(totals.mercari)}`,
      `楽天累計 / ${formatCurrency(totals.rakuten)}`,
      `Qoo10累計 / ${formatCurrency(totals.qoo10)}`,
      '---------------------------------------',
      `WEB売上累計 / ${formatCurrency(
        totals.amazon + totals.base + totals.yahoo + totals.mercari + totals.rakuten + totals.qoo10
      )}`,
      '【月内フロア＋WEB累計売上】',
      formatCurrency(
        totals.floor +
          totals.amazon +
          totals.base +
          totals.yahoo +
          totals.mercari +
          totals.rakuten +
          totals.qoo10
      ),
    ]

    return NextResponse.json({ ok: true, report: reportLines.join('\n') })
  } catch (e: any) {
    console.error('report_error', e)
    return NextResponse.json({ ok: false, error: e.message })
  }
}
