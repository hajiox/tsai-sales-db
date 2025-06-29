// /app/api/web-sales-data/route.ts
// ver.7 (削除件数正確取得版)
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')

    console.log('🔍 WEB-SALES-DATA API ver.7 - 受信パラメータ:', { month, url: request.url })

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
      return NextResponse.json({ 
        success: false, 
        error: 'monthパラメータが必要です' 
      }, { status: 400 })
    }

    console.log('🗑️ DELETE要求:', { month })

    // YYYY-MM形式のmonthパラメータをYYYY-MM-01の日付型に変換
    const targetDate = `${month}-01`

    console.log('🗑️ 削除対象日付:', { targetDate })

    // まず削除対象のレコード数を取得
    const { data: beforeData, error: countError } = await supabase
      .from('web_sales_summary')
      .select('id', { count: 'exact' })
      .eq('report_month', targetDate)

    if (countError) {
      console.error('🚨 COUNT エラー:', countError)
      return NextResponse.json({ 
        success: false, 
        error: 'データ件数の確認に失敗しました: ' + countError.message 
      }, { status: 500 })
    }

    const beforeCount = beforeData?.length || 0
    console.log('🔍 削除前レコード数:', { beforeCount })

    // 指定した月のデータを一括削除
    const { error } = await supabase
      .from('web_sales_summary')
      .delete()
      .eq('report_month', targetDate)

    if (error) {
      console.error('🚨 DELETE エラー:', error)
      return NextResponse.json({ 
        success: false, 
        error: 'データの削除に失敗しました: ' + error.message 
      }, { status: 500 })
    }

    console.log('✅ DELETE完了:', { deletedCount: beforeCount })

    return NextResponse.json({ 
      success: true,
      message: `${month}の販売データを削除しました`,
      deletedCount: beforeCount
    })
  } catch (error) {
    console.error('🚨 DELETE API エラー:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'データの削除に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー')
    }, { status: 500 })
  }
}
