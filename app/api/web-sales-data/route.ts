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
    
    const { data, error } = await supabase
      .from('web_sales_summary')
      .select('*')
      .eq('report_month', '2025-04-01')
      .limit(5)
      
    console.log('Supabase応答:', { dataCount: data?.length, error })
    
    if (error) {
      console.error('Supabaseエラー:', error)
      return NextResponse.json({ 
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      data: data || [],
      count: data?.length || 0
    })
    
  } catch (error: any) {
    console.error('APIエラー:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
