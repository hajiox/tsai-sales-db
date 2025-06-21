// /app/api/web-sales-data/route.ts
// ver.4 (DELETE機能修正版)
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

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')

    if (!month) {
      return NextResponse.json({ error: 'monthパラメータが必要です' }, { status: 400 })
    }

    // YYYY-MM形式のmonthパラメータをYYYY-MM-01の日付型に変換
    const targetDate = `${month}-01` // 日付文字列に変換

    // 指定した月のデータを一括削除
    const { error, count } = await supabase
      .from('web_sales_summary')
      .delete()
      .eq('report_month', targetDate) // 変換した日付文字列を使用

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
