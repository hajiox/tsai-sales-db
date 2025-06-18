import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { product_name, series_id, product_number, price } = await request.json()
    
    if (!product_name || !series_id || !product_number || price === undefined) {
      return NextResponse.json({ 
        error: '商品名、シリーズID、商品番号、価格が必要です' 
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
    
    // 同じシリーズの同じ商品番号が既に存在するかチェック
    const { data: existingData, error: checkError } = await supabase.rpc("web_sales_full_month", {
      target_month: new Date().toISOString().slice(0, 7)
    });
    
    if (checkError) {
      return NextResponse.json({ 
        error: '商品データ確認エラー: ' + checkError.message 
      }, { status: 500 })
    }
    
    const isDuplicate = existingData?.some((product: any) => 
      parseInt(product.series_name) === series_id && product.product_number === product_number
    )
    
    if (isDuplicate) {
      return NextResponse.json({ 
        error: 'このシリーズの商品番号は既に存在します' 
      }, { status: 400 })
    }
    
    // 新しい商品をweb_sales_summaryテーブルに追加
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01'
    
    const { data, error } = await supabase
      .from('web_sales_summary')
      .insert([
        {
          product_name: product_name,
          series_name: series_id.toString(),
          product_number: product_number,
          price: price,
          report_month: currentMonth,
          amazon_count: 0,
          rakuten_count: 0,
          yahoo_count: 0,
          mercari_count: 0,
          base_count: 0,
          qoo10_count: 0
        }
      ])
      .select()
      
    if (error) {
      console.error('商品追加エラー:', error)
      return NextResponse.json({ 
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      data: data[0],
      message: '商品が追加されました'
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
    const { product_id } = await request.json()
    
    if (!product_id) {
      return NextResponse.json({ 
        error: '商品IDが必要です' 
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
    
    // 販売実績があるかチェック
    const { data: productData, error: checkError } = await supabase
      .from('web_sales_summary')
      .select('amazon_count, rakuten_count, yahoo_count, mercari_count, base_count, qoo10_count')
      .eq('id', product_id)
      .single()
    
    if (checkError) {
      return NextResponse.json({ 
        error: '商品データ確認エラー: ' + checkError.message 
      }, { status: 500 })
    }
    
    if (productData) {
      const totalSales = (productData.amazon_count || 0) + (productData.rakuten_count || 0) + 
                        (productData.yahoo_count || 0) + (productData.mercari_count || 0) + 
                        (productData.base_count || 0) + (productData.qoo10_count || 0)
      
      if (totalSales > 0) {
        return NextResponse.json({ 
          error: 'この商品には販売実績があるため削除できません' 
        }, { status: 400 })
      }
    }
    
    const { error } = await supabase
      .from('web_sales_summary')
      .delete()
      .eq('id', product_id)
      
    if (error) {
      console.error('商品削除エラー:', error)
      return NextResponse.json({ 
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      message: '商品が削除されました'
    })
    
  } catch (error: any) {
    console.error('APIエラー:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
