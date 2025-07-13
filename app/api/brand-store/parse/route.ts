// /app/api/brand-store/parse/route.ts ver.4 (エラー修正版)
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

interface ParsedData {
  productName: string
  category: string | null
  taxType: string | null
  totalSales: number
  salesRatio: number
  grossProfit: number
  grossProfitRatio: number
  quantitySold: number
  quantityRatio: number
  returnedQuantity: number
  returnRatio: number
  productId: number | null
  productCode: string | null
  barcode: string | null
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const selectedYear = formData.get('year')
    const selectedMonth = formData.get('month')
    
    // デバッグ用ログ
    console.log('Received year:', selectedYear, 'month:', selectedMonth)
    
    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    }

    if (!selectedYear || !selectedMonth) {
      return NextResponse.json({ error: '年月が指定されていません' }, { status: 400 })
    }

    const text = await file.text()
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true
    })

    if (!result.data || result.data.length === 0) {
      return NextResponse.json({ error: 'CSVファイルにデータがありません' }, { status: 400 })
    }

    const supabase = createRouteHandlerClient({ cookies })

    // マスターデータを取得（商品名照合用）
    const { data: productMaster, error: productError } = await supabase
      .from('product_master')
      .select('*')
    
    if (productError) {
      console.error('Product master fetch error:', productError)
    }

    // product_name_aliases テーブルが存在する場合のみ取得
    let productAliases = []
    try {
      const { data: aliases, error: aliasError } = await supabase
        .from('product_name_aliases')
        .select('*')
      
      if (!aliasError) {
        productAliases = aliases || []
      }
    } catch (e) {
      console.log('product_name_aliases table might not exist yet')
    }

    // 商品ID、商品名、別名でのマッピングを作成
    const productIdMap = new Map(productMaster?.map(p => [p.product_id, p]) || [])
    const productNameMap = new Map(productMaster?.map(p => [p.product_name, p]) || [])
    const aliasMap = new Map(productAliases?.map(a => [a.alias_name, a.product_id]) || [])

    // 商品ごとに集計（重複データを合算）
    const productMap = new Map<string, ParsedData>()

    result.data.forEach((row: any) => {
      const productName = row['商品名']
      if (!productName || productName.trim() === '') return

      const existingData = productMap.get(productName)
      
      // 商品IDまたは商品名で照合
      let productIdFromRow = row['商品ID'] ? parseInt(row['商品ID']) : null
      let matchedProduct = null

      // 1. 商品IDで照合
      if (productIdFromRow) {
        matchedProduct = productIdMap.get(productIdFromRow)
      }
      
      // 2. 商品名で照合
      if (!matchedProduct) {
        matchedProduct = productNameMap.get(productName)
      }
      
      // 3. 別名で照合
      if (!matchedProduct) {
        const aliasProductId = aliasMap.get(productName)
        if (aliasProductId) {
          matchedProduct = productIdMap.get(aliasProductId)
        }
      }

      // マスターから情報を取得
      const finalProductId = matchedProduct?.product_id || productIdFromRow
      const finalCategoryId = matchedProduct?.category_id || null

      const newData: ParsedData = {
        productName,
        category: row['カテゴリー'] || null,
        taxType: row['税区分'] || null,
        totalSales: parseInt(row['販売総売上']?.replace(/[,円]/g, '') || '0'),
        salesRatio: parseFloat(row['構成比%']?.replace('%', '') || '0'),
        grossProfit: parseInt(row['粗利総額']?.replace(/[,円]/g, '') || '0'),
        grossProfitRatio: parseFloat(row['粗利率%']?.replace('%', '') || '0'),
        quantitySold: parseInt(row['販売商品数']?.replace(/,/g, '') || '0'),
        quantityRatio: parseFloat(row['構成比% ']?.replace('%', '') || '0'),
        returnedQuantity: parseInt(row['返品商品数']?.replace(/,/g, '') || '0'),
        returnRatio: parseFloat(row['返品率%']?.replace('%', '') || '0'),
        productId: finalProductId,
        productCode: row['商品コード'] || null,
        barcode: row['バーコード'] || null
      }

      if (existingData) {
        // 既存データがある場合は加算
        existingData.totalSales += newData.totalSales
        existingData.grossProfit += newData.grossProfit
        existingData.quantitySold += newData.quantitySold
        existingData.returnedQuantity += newData.returnedQuantity
      } else {
        productMap.set(productName, newData)
      }
    })

    // 構成比を再計算
    const totalSalesSum = Array.from(productMap.values()).reduce((sum, item) => sum + item.totalSales, 0)
    const totalQuantitySum = Array.from(productMap.values()).reduce((sum, item) => sum + item.quantitySold, 0)

    const parsedData = Array.from(productMap.values()).map(item => ({
      ...item,
      salesRatio: totalSalesSum > 0 ? (item.totalSales / totalSalesSum * 100) : 0,
      quantityRatio: totalQuantitySum > 0 ? (item.quantitySold / totalQuantitySum * 100) : 0,
      grossProfitRatio: item.totalSales > 0 ? (item.grossProfit / item.totalSales * 100) : 0
    }))

    return NextResponse.json({
      data: parsedData,
      summary: {
        totalRows: parsedData.length,
        totalSales: totalSalesSum,
        selectedYear: parseInt(selectedYear.toString()),
        selectedMonth: parseInt(selectedMonth.toString())
      }
    })
  } catch (error) {
    console.error('Parse error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : '解析に失敗しました' 
    }, { status: 500 })
  }
}
