// /app/api/import/csv-parse/route.ts ver.6
// 汎用CSV解析API（デバッグ強化版）

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

// 高機能CSV解析関数
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

function isValidString(value: any): value is string {
  return value && typeof value === 'string' && value.trim().length > 0;
}

// 🎯 安全な数値取得関数（デバッグ強化）
function getSafeNumber(csvRow: any, possibleKeys: string[], rowIndex: number, columnName: string): number {
  console.log(`\n🔍 getSafeNumber デバッグ - 行${rowIndex}, 列${columnName}:`)
  console.log(`  可能なキー: [${possibleKeys.join(', ')}]`)
  
  for (const key of possibleKeys) {
    const value = csvRow[key];
    console.log(`  キー"${key}": 値="${value}" (型: ${typeof value})`)
    
    if (value !== undefined && value !== null && value !== '') {
      const numValue = parseInt(String(value)) || 0;
      console.log(`  ✅ 採用: "${key}" = ${numValue}`)
      return numValue;
    }
  }
  
  console.log(`  ❌ 全てのキーで値が見つからない → 0を返す`)
  return 0;
}

export async function POST(request: NextRequest) {
  try {
    console.log("=== 汎用CSV Parse API開始 (デバッグ強化版) ===")
    
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
    
    console.log(`📁 ファイル情報: ${file.name}, 総行数: ${lines.length}`)
    
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSVファイルが空か、ヘッダーのみです' }, { status: 400 })
    }

    // ヘッダー解析
    const headers = parseCsvLine(lines[0])
    console.log("📋 CSV Headers:", headers)
    console.log(`ヘッダー数: ${headers.length}`)

    // 商品マスター取得
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')

    if (productsError) {
      console.error('商品マスター取得エラー:', productsError)
      return NextResponse.json({ error: '商品マスター取得に失敗しました' }, { status: 500 })
    }

    const validProducts = (products || []).filter(p => {
      if (!p || !isValidString(p.name)) {
        console.log('無効な商品データを除外:', p);
        return false;
      }
      return true;
    });
    console.log('有効な商品数:', validProducts.length);

    // CSV学習データ取得
    const { data: csvMappings, error: csvMappingsError } = await supabase
      .from('csv_product_mapping')
      .select('csv_title, product_id')

    if (csvMappingsError) {
      console.error('CSV学習データ取得エラー:', csvMappingsError)
      return NextResponse.json({ error: 'CSV学習データ取得に失敗しました' }, { status: 500 })
    }

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
    
    // 🎯 特定の商品（訪あり 1Kg）をフォーカス
    const targetProductName = "チャーシュー 訳あり ラーメン屋が作る本物のチャーシュー訳アリ1Kg";
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i])
      
      console.log(`\n🔍 行${i}解析開始:`)
      console.log(`生データ: ${lines[i]}`)
      console.log(`分割結果: [${values.map((v, idx) => `${idx}:"${v}"`).join(', ')}]`)
      
      if (values.length < headers.length) {
        console.warn(`❌ 行 ${i}: 列数が不足 (期待:${headers.length}, 実際:${values.length})`)
        continue
      }

      // CSV行データ作成
      const csvRow: any = {}
      headers.forEach((header, index) => {
        csvRow[header] = values[index] || ''
      })
      
      console.log(`📊 csvRow構築結果:`, Object.entries(csvRow).slice(0, 11))

      // 商品名の取得
      const productName = csvRow['商品名　　　2025.2更新'] || 
                         csvRow['商品名'] || 
                         csvRow[' 商品名　　　2025.2更新'] || 
                         values[0]
      
      console.log(`📝 商品名: "${productName}"`)
      
      if (!isValidString(productName)) {
        console.warn(`❌ 行 ${i}: 商品名が空またはnull`)
        continue
      }

      // 🎯 数量データ抽出（デバッグ強化）
      console.log(`\n💰 数量データ抽出 (行${i}):`)
      
      const amazonCount = getSafeNumber(csvRow, ['Amazon', ' Amazon'], i, 'Amazon') || parseInt(values[2]) || 0
      const rakutenCount = getSafeNumber(csvRow, ['楽天市場', ' 楽天市場'], i, '楽天') || parseInt(values[3]) || 0
      const yahooCount = getSafeNumber(csvRow, ['Yahoo!', ' Yahoo!'], i, 'Yahoo') || parseInt(values[4]) || 0
      const mercariCount = getSafeNumber(csvRow, ['メルカリ', ' メルカリ'], i, 'メルカリ') || parseInt(values[5]) || 0
      const baseCount = getSafeNumber(csvRow, ['BASE', ' BASE'], i, 'BASE') || parseInt(values[6]) || 0
      const qoo10Count = getSafeNumber(csvRow, ['Qoo10', ' Qoo10'], i, 'Qoo10') || parseInt(values[8]) || 0

      // 🎯 特定商品の詳細ログ
      if (productName.includes("訳あり") && productName.includes("1Kg")) {
        console.log(`\n🎯 特定商品発見: "${productName}"`)
        console.log(`生データ詳細: ${lines[i]}`)
        console.log(`各列の値:`)
        values.forEach((val, idx) => {
          console.log(`  [${idx}]: "${val}"`)
        })
        console.log(`抽出された数量:`)
        console.log(`  Amazon: ${amazonCount}`)
        console.log(`  楽天: ${rakutenCount}`) 
        console.log(`  Yahoo: ${yahooCount}`)
        console.log(`  メルカリ: ${mercariCount}`)
        console.log(`  BASE: ${baseCount}`)
        console.log(`  Qoo10: ${qoo10Count}`)
      }

      // 異常値チェック
      if (amazonCount > 10000 || rakutenCount > 10000 || yahooCount > 10000 || 
          mercariCount > 10000 || baseCount > 10000 || qoo10Count > 10000) {
        console.warn(`❌ 行 ${i}: 異常な数値を検出 - スキップ`)
        continue
      }

      try {
        if (!isValidString(productName) || !validProducts || !validLearningData) {
          console.error('マッチング前の検証失敗');
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

        const productInfo = findBestMatchSimplified(productName, validProducts, validLearningData)

        if (productInfo) {
          matchedCount++
          
          // 🎯 特定商品のマッチング結果
          if (productName.includes("訳あり") && productName.includes("1Kg")) {
            console.log(`🎯 特定商品マッチング結果:`)
            console.log(`  マッチした商品: ${productInfo.name}`)
            console.log(`  商品ID: ${productInfo.id}`)
          }
          
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
          console.log(`✅ マッチ成功: "${productName}" -> ${productInfo.name}`)
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
          console.log(`❌ マッチ失敗: "${productName}"`)
        }
      } catch (error) {
        console.error(`マッチング エラー (${productName}):`, error);
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
