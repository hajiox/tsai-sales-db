// /app/api/brand-store/parse/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const selectedYear = formData.get('selectedYear') as string
    const selectedMonth = formData.get('selectedMonth') as string

    if (!file) {
      return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 })
    }

    const text = await file.text()
    
    // CSVをパース
    const parseResult = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true
    })

    if (parseResult.errors.length > 0) {
      console.error('Parse errors:', parseResult.errors)
      return NextResponse.json({ 
        error: 'CSVの解析に失敗しました', 
        details: parseResult.errors 
      }, { status: 400 })
    }

    // データを整形
    const parsedData = parseResult.data.map((row: any) => ({
      product_name: row['商品名'] || '',
      category: row['カテゴリー'] || '',
      tax_type: row['税区分'] || '',
      total_sales: parseInt(row['販売総売上']) || 0,
      sales_ratio: parseFloat(row['構成比%']) || 0,
      gross_profit: parseInt(row['粗利総額']) || 0,
      gross_profit_ratio: parseFloat(row['構成比%_1']) || 0,
      quantity_sold: parseInt(row['販売商品数']) || 0,
      quantity_ratio: parseFloat(row['構成比%_2']) || 0,
      returned_quantity: parseInt(row['返品商品数']) || 0,
      return_ratio: parseFloat(row['構成比%_3']) || 0,
      product_id: row['商品ID'] ? parseInt(row['商品ID']) : null,
      product_code: row['商品コード'] || null,
      barcode: row['バーコード'] || null,
      report_month: `${selectedYear}-${selectedMonth.padStart(2, '0')}-01`
    })).filter((item: any) => item.product_name) // 商品名がないものは除外

    // サマリー情報を計算
    const summary = {
      totalProducts: parsedData.length,
      totalSales: parsedData.reduce((sum: number, item: any) => sum + item.total_sales, 0),
      totalQuantity: parsedData.reduce((sum: number, item: any) => sum + item.quantity_sold, 0),
      categories: [...new Set(parsedData.map((item: any) => item.category))].length
    }

    return NextResponse.json({
      success: true,
      data: parsedData,
      summary,
      reportMonth: `${selectedYear}年${selectedMonth}月`
    })
  } catch (error) {
    console.error('Parse error:', error)
    return NextResponse.json({ 
      error: 'サーバーエラーが発生しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
