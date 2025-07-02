// /app/api/import/csv-parse/route.ts ver.4
// 汎用CSV解析API（CSV解析強化版）

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findBestMatchSimplified } from '@/lib/csvHelpers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  matchType?: string
}

// 🎯 楽天と同じ高機能CSV解析関数
function parseCsvLine(line: string): string[] {
  const columns = [];
  let currentColumn = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        currentColumn += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      columns.push(currentColumn.trim());
      currentColumn = '';
    } else {
      currentColumn += char;
    }
  }
  columns.push(currentColumn.trim());
  return columns;
}

// 楽天と同じ安全な文字列検証関数
function isValidString(value: any): value is string {
  return value && typeof value === 'string' && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  try {
    console.log("=== 汎用CSV Parse API開始 (CSV解析強化版) ===")
    
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

    // ヘッダー解析（高機能解析使用）
    const headers = parseCsvLine(lines[0])
    console.log("CSV Headers:", headers)

    // 商品マスター取得（楽天方式の厳密検証）
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')

    if (productsError) {
      console.error('商品マスター取得エラー:', productsError)
      return NextResponse.json({ error: '商品マスター取得に失敗しました' }, { status: 500 })
    }

    // 商品データの厳密な検証（楽天方式）
    const validProducts = (products || []).filter(p => {
      if (!p || !isValidString(p.name)) {
        console.log('無効な商品データを除外:', p);
        return false;
      }
      return true;
    });
    console.log('有効な商品数:', validProducts.length);

    // CSV学習データ取得（楽天方式）
    const { data: csvMappings, error: csvMappingsError } = await supabase
      .from('csv_product_mapping')
      .select('csv_title, product_id')

    if (csvMappingsError) {
      console.error('CSV学習データ取得エラー:', csvMappingsError)
      return NextResponse.json({ error: 'CSV学習データ取得に失敗しました' }, { status: 500 })
    }

    // 学習データの厳密な検証（楽天方式）
    const validLearningData = (csvMappings || []).filter(l => {
      if (!l || !isValidString(l.csv_title)) {
        console.log('無効なCSV学習データを除外:', l);
        return false;
      }
      return true;
    });
    console.log('有効なCSV学習データ数:', validLearningData.length);

    // データ行解析
    const parsedItems: ParsedItem[] = []
    let matchedCount = 0
    let unmatchedCount = 0
    
    for (let i = 1; i < lines.length; i++) {
      // 🎯 高機能CSV解析を使用
      const values = parseCsvLine(lines[i])
      
      if (values.length < headers.length) {
        console.warn(`行 ${i + 1}: 列数が不足しています (期待:${headers.length}, 実際:${values.length})`)
        console.warn(`行内容: ${lines[i]}`)
        continue
      }

      // CSV行データ作成
      const csvRow: any = {}
      headers.forEach((header, index) => {
        csvRow[header] = values[index] || ''
      })

      const productName = csvRow['商品名　　　2025.2更新'] || csvRow['商品名']
      
      // 楽天方式の厳密な文字列検証
      if (!isValidString(productName)) {
        console.warn(`行 ${i + 1}: 商品名が空またはnullです`)
        continue
      }

      // 数量データ抽出（数値変換）- より安全な変換
      const amazonCount = parseInt(csvRow['Amazon']) || 0
      const rakutenCount = parseInt(csvRow['楽天市場']) || 0
      const yahooCount = parseInt(csvRow['Yahoo!']) || 0
      const mercariCount = parseInt(csvRow['メルカリ']) || 0
      const baseCount = parseInt(csvRow['BASE']) || 0
      const qoo10Count = parseInt(csvRow['Qoo10']) || 0

      // 異常値チェック（Amazon異常値対策）
      if (amazonCount > 10000 || rakutenCount > 10000 || yahooCount > 10000 || 
          mercariCount > 10000 || baseCount > 10000 || qoo10Count > 10000) {
        console.warn(`行 ${i + 1}: 異常な数値を検出 - 商品名:"${productName}", Amazon:${amazonCount}, 楽天:${rakutenCount}, Yahoo:${yahooCount}, メルカリ:${mercariCount}, BASE:${baseCount}, Qoo10:${qoo10Count}`)
        console.warn(`行データ詳細:`, values)
        continue
      }

      console.log(`処理中: "${productName}" (Amazon:${amazonCount}, 楽天:${rakutenCount}, Yahoo:${yahooCount}, メルカリ:${mercariCount}, BASE:${baseCount}, Qoo10:${qoo10Count})`)

      try {
        // 楽天方式の高機能マッチング呼び出し前の最終検証
        if (!isValidString(productName) || !validProducts || !validLearningData) {
          console.error('findBestMatchSimplified呼び出し前の検証失敗');
          unmatchedCount++
          parsedItems.push({
            csvTitle: productName,
            amazonCount,
            rakutenCount,
            yahooCount,
            mercariCount,
            baseCount,
            qoo10Count,
            matchedProduct: null,
            confidence: 0
          })
          continue;
        }

        // 🎯 楽天と同じ高機能マッチング関数を使用
        const productInfo = findBestMatchSimplified(productName, validProducts, validLearningData)

        if (productInfo) {
          matchedCount++
          parsedItems.push({
            csvTitle: productName,
            amazonCount,
            rakutenCount,
            yahooCount,
            mercariCount,
            baseCount,
            qoo10Count,
            matchedProduct: productInfo,
            confidence: 0.9,
            matchType: productInfo.matchType || 'auto'
          })
          console.log(`マッチ成功: "${productName}" -> ${productInfo.name}`)
        } else {
          unmatchedCount++
          parsedItems.push({
            csvTitle: productName,
            amazonCount,
            rakutenCount,
            yahooCount,
            mercariCount,
            baseCount,
            qoo10Count,
            matchedProduct: null,
            confidence: 0
          })
          console.log(`マッチ失敗: "${productName}"`)
        }
      } catch (error) {
        console.error(`findBestMatchSimplified エラー (${productName}):`, error);
        unmatchedCount++
        parsedItems.push({
          csvTitle: productName,
          amazonCount,
          rakutenCount,
          yahooCount,
          mercariCount,
          baseCount,
          qoo10Count,
          matchedProduct: null,
          confidence: 0
        })
      }
    }

    console.log('=== 汎用CSV Parse API完了 ===');
    console.log('マッチ商品数:', matchedCount);
    console.log('未マッチ商品数:', unmatchedCount);
    console.log(`CSV解析完了: ${parsedItems.length}件`)

    return NextResponse.json({
      success: true,
      data: parsedItems,
      month: month,
      summary: {
        total: parsedItems.length,
        matched: matchedCount,
        unmatched: unmatchedCount
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
