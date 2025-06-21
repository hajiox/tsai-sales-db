// /app/api/web-sales-data/route.ts
// ver.2 (DELETE機能追加版)
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')

    if (!month) {
      return NextResponse.json({ error: 'monthパラメータが必要です' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc("web_sales_full_month", { target_month: month })
    
    if (error) throw error

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('データ取得エラー:', error)
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { month, updates } = body

    if (!month || !updates || !Array.isArray(updates)) {
      return NextResponse.json({ error: '無効なリクエストデータです' }, { status: 400 })
    }

    for (const update of updates) {
      const { product_id, ...updateData } = update
      
      const { error } = await supabase
        .from('web_sales_summary')
        .upsert({
          product_id,
          report_month: month,
          ...updateData
        }, {
          onConflict: 'product_id,report_month'
        })

      if (error) throw error
    }

    return NextResponse.json({ message: 'データが正常に保存されました' })
  } catch (error) {
    console.error('データ保存エラー:', error)
    return NextResponse.json({ error: 'データの保存に失敗しました' }, { status: 500 })
  }
}

// 新規追加: DELETE機能
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')

    if (!month) {
      return NextResponse.json({ error: 'monthパラメータが必要です' }, { status: 400 })
    }

    // 指定した月のデータを一括削除
    const { error, count } = await supabase
      .from('web_sales_summary')
      .delete()
      .eq('report_month', month)

    if (error) throw error

    return NextResponse.json({ 
      message: `${month}の販売データを削除しました`,
      deletedCount: count 
    })
  } catch (error) {
    console.error('データ削除エラー:', error)
    return NextResponse.json({ error: 'データの削除に失敗しました' }, { status: 500 })
  }
}
