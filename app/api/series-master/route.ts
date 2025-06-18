import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
    
    const { data, error } = await supabase
      .from('series_master')
      .select('*')
      .order('series_id', { ascending: true })
      
    if (error) {
      console.error('シリーズ取得エラー:', error)
      return NextResponse.json({ 
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      data: data || []
    })
    
  } catch (error: any) {
    console.error('APIエラー:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { series_name } = await request.json()
    
    if (!series_name) {
      return NextResponse.json({ 
        error: 'シリーズ名が必要です' 
      }, { status: 400 })
    }
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
    
    // 最大series_idを取得して+1
    const { data: maxData, error: maxError } = await supabase
      .from('series_master')
      .select('series_id')
      .order('series_id', { ascending: false })
      .limit(1)
    
    if (maxError) {
      return NextResponse.json({ 
        error: maxError.message 
      }, { status: 500 })
    }
    
    const nextSeriesId = maxData && maxData.length > 0 ? maxData[0].series_id + 1 : 1
    
    const { data, error } = await supabase
      .from('series_master')
      .insert([
        { 
          series_id: nextSeriesId, 
          series_name: series_name 
        }
      ])
      .select()
      
    if (error) {
      console.error('シリーズ追加エラー:', error)
      return NextResponse.json({ 
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      data: data[0],
      message: 'シリーズが追加されました'
    })
    
  } catch (error: any) {
    console.error('APIエラー:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { series_id } = await request.json()
    
    if (!series_id) {
      return NextResponse.json({ 
        error: 'シリーズIDが必要です' 
      }, { status: 400 })
    }
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
    
    // 該当シリーズに商品があるかチェック
    const { data: productsData, error: checkError } = await supabase.rpc("web_sales_full_month", {
      target_month: new Date().toISOString().slice(0, 7)
    });
    
    if (checkError) {
      return NextResponse.json({ 
        error: '商品データ確認エラー: ' + checkError.message 
      }, { status: 500 })
    }
    
    const hasProducts = productsData?.some((product: any) => 
      parseInt(product.series_name) === series_id
    )
    
    if (hasProducts) {
      return NextResponse.json({ 
        error: 'このシリーズには商品が存在するため削除できません' 
      }, { status: 400 })
    }
    
    const { error } = await supabase
      .from('series_master')
      .delete()
      .eq('series_id', series_id)
      
    if (error) {
      console.error('シリーズ削除エラー:', error)
      return NextResponse.json({ 
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      message: 'シリーズが削除されました'
    })
    
  } catch (error: any) {
    console.error('APIエラー:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
