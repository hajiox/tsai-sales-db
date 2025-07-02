// /app/api/import/csv-parse/route.ts ver.1
// 汎用CSV解析API（社内集計済みEXCEL取り込み用）

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findBestProductMatch } from '@/lib/csvHelpers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface CsvRow {
  商品名: string
  価格: number
  Amazon: number
  楽天市場: number
  'Yahoo!': number
  メルカリ: number
  BASE: number
  フロア: number
  Qoo10: number
  合計: number
  売上: string
}

interface ParsedItem {
  csvTitle: string
  amazonCount: number
  rakutenCount: number
  yahooCount: number
  mercariCount: number
  baseCount: number
  qoo10Count: number
  matchedProduct: any
  confidence: number
}

export async function POST(request: NextRequest) {
  try {
    console.log("CSV Parse API called")
    
    const formData = await request.formData()
    const file = formData.get('file') as File
    const month = formData.get('month') as string

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    }

    if (!month) {
      return NextResponse.json({ error: '月が指定されていません' }, { status: 400 })
    }

    // CSVファイル読み込み
    const fileContent = await file.text()
    const lines = fileContent.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSVファイルが空か、ヘッダーのみです' }, { status: 400 })
    }

    // ヘッダー解析
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    console.log("CSV Headers:", headers)

    // 商品マスター取得
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')

    if (productsError) {
      console.error('商品マスター取得エラー:', productsError)
      return NextResponse.json({ error: '商品マスター取得に失敗しました' }, { status: 500 })
    }

    // CSV学習データ取得
    const { data: csvMappings, error: csvMappingsError } = await supabase
      .from('csv_product_mapping')
      .select('*')

    if (csvMappingsError) {
      console.error('CSV学習データ取得エラー:', csvMappingsError)
      return NextResponse.json({ error: 'CSV学習データ取得に失敗しました' }, { status: 500 })
    }

    // 学習データをproductsに統合
    const productsWithCsvTitles = products.map(product => ({
      ...product,
      csv_title: csvMappings.find(m => m.product_id === product.id)?.csv_title || undefined
    }))

    // データ行解析
    const parsedItems: ParsedItem[] = []
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
      
      if (values.length < headers.length) {
        console.warn(`行 ${i + 1}: 列数が不足しています`)
        continue
      }

      // CSV行データ作成
      const csvRow: any = {}
      headers.forEach((header, index) => {
        csvRow[header] = values[index]
      })

      const productName = csvRow['商品名　　　2025.2更新'] || csvRow['商品名']
      if (!productName) {
        console.warn(`行 ${i + 1}: 商品名が空です`)
        continue
      }

      // 数量データ抽出（数値変換）
      const amazonCount = parseInt(csvRow['Amazon']) || 0
      const rakutenCount = parseInt(csvRow['楽天市場']) || 0
      const yahooCount = parseInt(csvRow['Yahoo!']) || 0
      const mercariCount = parseInt(csvRow['メルカリ']) || 0
      const baseCount = parseInt(csvRow['BASE']) || 0
      const qoo10Count = parseInt(csvRow['Qoo10']) || 0

      // 商品マッチング
      const matchResult = findBestProductMatch(productName, productsWithCsvTitles)

      parsedItems.push({
        csvTitle: productName,
        amazonCount,
        rakutenCount,
        yahooCount,
        mercariCount,
        baseCount,
        qoo10Count,
        matchedProduct: matchResult.product,
        confidence: matchResult.confidence
      })
    }

    console.log(`CSV解析完了: ${parsedItems.length}件`)

    return NextResponse.json({
      success: true,
      data: parsedItems,
      month: month,
      summary: {
        total: parsedItems.length,
        matched: parsedItems.filter(item => item.matchedProduct).length,
        unmatched: parsedItems.filter(item => !item.matchedProduct).length
      }
    })

  } catch (error) {
    console.error('CSV Parse API エラー:', error)
    return NextResponse.json({ 
      error: 'CSV解析中にエラーが発生しました',
      details: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 })
  }
}
