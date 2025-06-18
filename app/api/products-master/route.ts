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
    const { data: existingData, error: checkError } = await supabase
      .from('products')
      .select('series_code, product_code')
      .eq('series_code', series_id)
      .eq('product_code', product_number)
    
    if (checkError) {
      return NextResponse.json({ 
        error: '商品データ確認エラー: ' + checkError.message 
      }, { status: 500 })
    }
    
    if (existingData && existingData.length > 0) {
      return NextResponse.json({ 
        error: 'このシリーズの商品番号は既に存在します' 
      }, { status: 400 })
    }

    // シリーズ一覧を取得（シリーズ名取得用）
    const { data: seriesList, error: seriesError } = await supabase
      .from('series_master')
      .select('series_id, series_name')
    
    if (seriesError) {
      return NextResponse.json({ 
        error: 'シリーズデータ取得エラー: ' + seriesError.message 
      }, { status: 500 })
    }
    
    // 新しい商品をproductsテーブルに追加
    const { data: productData, error: productError } = await supabase
      .from('products')
      .insert([
        {
          name: product_name,
          series: seriesList.find(s => s.series_id === series_id)?.series_name || '',
          series_code: series_id,
          price: price,
          product_code: product_number,
          product_number: product_number
        }
      ])
      .select()
      
    if (productError) {
      console.error('商品追加エラー:', productError)
      return NextResponse.json({ 
        error: productError.message 
      }, { status: 500 })
    }

    // web_sales_summaryテーブルにも対応レコードを追加
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01'
    
    const { data, error } = await supabase
      .from('web_sales_summary')
      .insert([
        {
          product_id: productData[0].id,
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
      data: productData[0],
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
    const { product_id, force_delete = false } = await request.json()
    
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
    const { data: salesData, error: checkError } = await supabase
      .from('web_sales_summary')
      .select('amazon_count, rakuten_count, yahoo_count, mercari_count, base_count, qoo10_count')
      .eq('product_id', product_id)
      .single()
    
    if (checkError && checkError.code !== 'PGRST116') {
      return NextResponse.json({ 
        error: '販売データ確認エラー: ' + checkError.message 
      }, { status: 500 })
    }
    
    if (salesData) {
      const totalSales = (salesData.amazon_count || 0) + (salesData.rakuten_count || 0) + 
                        (salesData.yahoo_count || 0) + (salesData.mercari_count || 0) + 
                        (salesData.base_count || 0) + (salesData.qoo10_count || 0)
      
      if (totalSales > 0 && !force_delete) {
        return NextResponse.json({ 
          error: 'sales_exist',
          sales_count: totalSales,
          message: 'この商品には販売実績があります。販売データと一緒に削除しますか？' 
        }, { status: 409 })
      }
    }
    
    // web_sales_summaryから削除（販売実績も含めて削除）
    await supabase
      .from('web_sales_summary')
      .delete()
      .eq('product_id', product_id)
    
    // productsテーブルから削除
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', product_id)
      
    if (error) {
      console.error('商品削除エラー:', error)
      return NextResponse.json({ 
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      message: force_delete ? '商品と販売実績を削除しました' : '商品が削除されました'
    })
    
  } catch (error: any) {
    console.error('APIエラー:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}
