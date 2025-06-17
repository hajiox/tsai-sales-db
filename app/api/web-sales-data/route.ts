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
    
    // 全データを取得（商品名・シリーズ名を含む）
    const { data, error } = await supabase
      .from('web_sales_summary')
      .select(`
        id,
        product_id,
        product_name,
        series_name,
        product_code,
        product_number,
        amazon_count,
        rakuten_count,
        yahoo_count,
        mercari_count,
        base_count,
        qoo10_count,
        report_month
      `)
      .order('product_code', { ascending: true })
      .order('product_number', { ascending: true })
      
    console.log('取得データ件数:', data?.length)
    console.log('最初の3件のサンプル:', data?.slice(0, 3))
    
    if (error) {
      console.error('Supabaseエラー:', error)
      return NextResponse.json({ 
        error: error.message 
      }, { status: 500 })
    }
    
    // データの品質確認
    const hasProductName = data?.some(item => item.product_name && item.product_name !== null && item.product_name !== '')
    const hasSeriesName = data?.some(item => item.series_name && item.series_name !== null && item.series_name !== '')
    
    console.log('商品名あり:', hasProductName)
    console.log('シリーズ名あり:', hasSeriesName)
    
    return NextResponse.json({ 
      data: data || [],
      count: data?.length || 0,
      debug: {
        hasProductName,
        hasSeriesName,
        totalRecords: data?.length || 0,
        sampleData: data?.slice(0, 2) || []
      }
    })
    
  } catch (error: any) {
    console.error('APIエラー:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
