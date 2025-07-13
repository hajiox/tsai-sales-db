// /app/api/brand-store/confirm/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const { data: importData, reportMonth } = await request.json()
    
    if (!importData || importData.length === 0) {
      return NextResponse.json({ error: 'データがありません' }, { status: 400 })
    }

    // Service Roleクライアントを使用
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 既存データを削除（同じ月のデータ）
    const { error: deleteError } = await supabase
      .from('brand_store_sales')
      .delete()
      .eq('report_month', importData[0].report_month)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      throw new Error(`既存データの削除に失敗しました: ${deleteError.message}`)
    }

    // 新規データを挿入
    const { error: insertError } = await supabase
      .from('brand_store_sales')
      .insert(importData)

    if (insertError) {
      console.error('Insert error:', insertError)
      throw new Error(`データの保存に失敗しました: ${insertError.message}`)
    }

    return NextResponse.json({
      success: true,
      message: `${reportMonth}のデータを保存しました`,
      count: importData.length
    })
  } catch (error) {
    console.error('Confirm error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'データの保存に失敗しました'
    }, { status: 500 })
  }
}
