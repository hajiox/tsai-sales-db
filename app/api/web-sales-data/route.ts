import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    console.log('APIルート: データ取得開始')
    
    // Supabaseクライアントを作成
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('環境変数が設定されていません')
      return NextResponse.json({ 
        error: 'Supabase環境変数が設定されていません' 
      }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
    console.log('Supabaseクライアント作成完了')
    
    // report_monthがNULLのデータを確認
    const { data: nullData, error: nullError } = await supabase
      .from('web_sales_summary')
      .select('*')
      .is('report_month', null)
      .limit(5)
      
    console.log('report_monthがNULLのデータ:', nullData)
    
    // report_monthが非NULLのデータを確認
    const { data: notNullData, error: notNullError } = await supabase
      .from('web_sales_summary')
      .select('*')
      .not('report_month', 'is', null)
      .limit(5)
      
    console.log('report_monthが非NULLのデータ:', notNullData)
    
    // 全データを少し取得（report_month条件なし）
    const { data: allData, error: allError } = await supabase
      .from('web_sales_summary')
      .select('*')
      .limit(5)
      
    console.log('全データサンプル:', allData)
    
    // まず、テーブル内の全ての月を確認（詳細表示）
    const { data: allMonths, error: monthsError } = await supabase
      .from('web_sales_summary')
      .select('report_month, id, product_name')
      .limit(10)
      
    console.log('利用可能な月（詳細）:', allMonths)
    
    // テーブル全体の件数を確認
    const { count, error: countError } = await supabase
      .from('web_sales_summary')
      .select('*', { count: 'exact', head: true })
      
    console.log('テーブル全体の件数:', count)
    
    // 2025年4月に近い日付で検索してみる
    const { data: april2025, error: aprilError } = await supabase
      .from('web_sales_summary')
      .select('*')
      .like('report_month', '2025-04%')
      .limit(3)
      
    console.log('2025年4月関連データ:', april2025)
    
    // 次に、2025-04-01のデータを取得
    const { data, error } = await supabase
      .from('web_sales_summary')
      .select('*')
      .eq('report_month', '2025-04-01')
      .limit(5)
      
    console.log('2025-04-01のデータ:', { dataCount: data?.length, error })
    
    if (error) {
      console.error('Supabaseエラー:', error)
      return NextResponse.json({ 
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      data: allData || [], // report_month条件なしのデータを返す
      count: allData?.length || 0,
      availableMonths: allMonths || [],
      totalCount: count,
      nullData: nullData || [],
      notNullData: notNullData || [],
      debug: {
        searchMonth: '2025-04-01',
        foundData: data?.length || 0,
        totalRecords: count,
        nullDataCount: nullData?.length || 0,
        notNullDataCount: notNullData?.length || 0,
        allDataCount: allData?.length || 0
      }
    })
    
  } catch (error: any) {
    console.error('APIエラー:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
