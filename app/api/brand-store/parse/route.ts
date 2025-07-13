// /app/api/brand-store/parse/route.ts ver.2
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

    // 商品名でグループ化して集計
    const productMap = new Map<string, any>()
    
    parseResult.data.forEach((row: any) => {
      const productName = row['商品名']
      if (!productName) return
      
      if (productMap.has(productName)) {
        // 既存のデータに加算
        const existing = productMap.get(productName)
        existing.total_sales += parseInt(row['販売総売上']) || 0
        existing.gross_profit += parseInt(row['粗利総額']) || 0
        existing.quantity_sold += parseInt(row['販売商品数']) || 0
        existing.returned_quantity += parseInt(row['返品商品数']) || 0
      } else {
        // 新規データとして追加
        productMap.set(productName, {
          product_name: productName,
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
        })
      }
    })

    // Mapから配列に変換
    const parsedData = Array.from(productMap.values())

    // 構成比を再計算
    const totalSales = parsedData.reduce((sum, item) => sum + item.total_sales, 0)
    const totalGrossProfit = parsedData.reduce((sum, item) => sum + item.gross_profit, 0)
    const totalQuantity = parsedData.reduce((sum, item) => sum + item.quantity_sold, 0)
    const totalReturns = parsedData.reduce((sum, item) => sum + item.returned_quantity, 0)

    parsedData.forEach(item => {
      item.sales_ratio = totalSales > 0 ? (item.total_sales / totalSales * 100) : 0
      item.gross_profit_ratio = totalGrossProfit > 0 ? (item.gross_profit / totalGrossProfit * 100) : 0
      item.quantity_ratio = totalQuantity > 0 ? (item.quantity_sold / totalQuantity * 100) : 0
      item.return_ratio = totalReturns > 0 ? (item.returned_quantity / totalReturns * 100) : 0
    })

    // サマリー情報を計算
    const summary = {
      totalProducts: parsedData.length,
      totalSales: totalSales,
      totalQuantity: totalQuantity,
      categories: [...new Set(parsedData.map((item: any) => item.category))].length
    }

    // 重複があった場合はログに出力
    const duplicateCount = parseResult.data.filter((row: any) => row['商品名']).length - parsedData.length
    if (duplicateCount > 0) {
      console.log(`${duplicateCount}件の重複商品がありました（集計済み）`)
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
