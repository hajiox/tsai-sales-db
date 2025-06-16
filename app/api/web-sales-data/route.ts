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
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    console.log('Supabaseクライアント作成完了')
    
    // まず、テーブル内の全ての月を確認
    const { data: allMonths, error: monthsError } = await supabase
      .from('web_sales_summary')
      .select('report_month')
      .limit(10)
      
    console.log('利用可能な月:', allMonths)
    
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
      data: data || [],
      count: data?.length || 0,
      availableMonths: allMonths || [],
      debug: {
        searchMonth: '2025-04-01',
        foundData: data?.length || 0
      }
    })
    
  } catch (error: any) {
    console.error('APIエラー:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
