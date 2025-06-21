// /app/api/web-sales-data/route.ts
// ver.5 (デバッグ強化版)
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')

    console.log('🔍 WEB-SALES-DATA API ver.5 - 受信パラメータ:', { month, url: request.url })

    if (!month) {
      return NextResponse.json({ error: 'monthパラメータが必要です' }, { status: 400 })
    }

    console.log('📞 DB関数呼び出し開始:', { function: 'web_sales_full_month', target_month: month })

    const { data, error } = await supabase.rpc("web_sales_full_month", { target_month: month })
    
    console.log('📊 DB関数結果:', { 
      success: !error, 
      error: error?.message, 
      dataLength: data?.length,
      sampleData: data?.slice(0, 2) // 最初の2件だけ表示
    })

    if (error) {
      console.error('🚨 DB関数エラー詳細:', error)
      throw error
    }

    console.log('✅ レスポンス準備完了:', { dataCount: data?.length || 0 })

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('🚨 API全体エラー:', error)
    return NextResponse.json({ 
      error: 'データの取得に失敗しました',
      details: error instanceof Error ? error.message : '不明なエラー',
      month: searchParams.get('month')
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')

    if (!month) {
      return NextResponse.json({ error: 'monthパラメータが必要です' }, { status: 400 })
    }

    console.log('🗑️ DELETE要求:', { month })

    // YYYY-MM形式のmonthパラメータをYYYY-MM-01の日付型に変換
    const targetDate = `${month}-01` // 日付文字列に変換

    console.log('🗑️ 削除対象日付:', { targetDate })

    // 指定した月のデータを一括削除
    const { error, count } = await supabase
      .from('web_sales_summary')
      .delete()
      .eq('report_month', targetDate) // 変換した日付文字列を使用

    if (error) {
      console.error('🚨 DELETE エラー:', error)
      throw error
    }

    console.log('✅ DELETE完了:', { deletedCount: count })

    return NextResponse.json({ 
      message: `${month}の販売データを削除しました`,
      deletedCount: count 
    })
  } catch (error) {
    console.error('🚨 DELETE API エラー:', error)
    return NextResponse.json({ error: 'データの削除に失敗しました' }, { status: 500 })
  }
}
