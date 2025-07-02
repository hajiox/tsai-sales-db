// /app/api/import/csv-parse/route.ts ver.7
// 汎用CSV解析API（列インデックス修正版）

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

// 🎯 安全な数値取得関数（改善版）
function getSafeNumber(value: any, columnName: string, rowIndex: number): number {
  console.log(`  getSafeNumber - 行${rowIndex}, 列${columnName}: 値="${value}" (型: ${typeof value})`)
  
  if (value === undefined || value === null || value === '') {
    console.log(`    → 空値のため0を返す`)
    return 0;
  }
  
  // 数値型の場合はそのまま返す（小数点も考慮）
  if (typeof value === 'number') {
    const intValue = Math.floor(value); // 小数点以下切り捨て
    console.log(`    → 数値型: ${value} → 整数化: ${intValue}`)
    return intValue;
  }
  
  // 文字列型の場合は変換を試みる
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const numValue = parseInt(trimmed, 10) || 0;
    console.log(`    → 文字列型: "${trimmed}" → 数値化: ${numValue}`)
    return numValue;
  }
  
  console.log(`    → 予期しない型のため0を返す`)
  return 0;
}

export async function POST(request: NextRequest) {
  try {
    console.log("=== 汎用CSV Parse API開始 (列インデックス修正版) ===")
    
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

    // ヘッダー解析（高機能パーサー使用）
    const headers = parseCsvLine(lines[0])
    console.log("📋 CSV Headers:", headers)
    console.log(`ヘッダー数: ${headers.length}`)

    // ヘッダーのトリミング
    const trimmedHeaders = headers.map(h => h.trim())

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
    
    for (let i = 1; i < lines.length; i++) {
      // 高機能パーサーで解析
      const values = parseCsvLine(lines[i])
      
      console.log(`\n🔍 行${i}解析開始:`)
      console.log(`生データ: ${lines[i].substring(0, 100)}...`)
      console.log(`解析後の列数: ${values.length}`)
      
      if (values.length < trimmedHeaders.length) {
        console.warn(`❌ 行 ${i}: 列数が不足 (期待:${trimmedHeaders.length}, 実際:${values.length})`)
        continue
      }

      // CSV行データ作成（トリミングされたヘッダーを使用）
      const csvRow: any = {}
      trimmedHeaders.forEach((header, index) => {
        csvRow[header] = values[index] || ''
      })

      // 商品名の取得（複数パターン対応）
      const productName = csvRow['商品名　　　2025.2更新'] || 
                         csvRow['商品名'] || 
                         values[0]
      
      console.log(`📝 商品名: "${productName}"`)
      
      if (!isValidString(productName)) {
        console.warn(`❌ 行 ${i}: 商品名が空またはnull`)
        continue
      }

      // 🎯 数量データ抽出（ヘッダー名で直接アクセス）
      console.log(`\n💰 数量データ抽出 (行${i}):`)
      
      const amazonCount = getSafeNumber(csvRow['Amazon'], 'Amazon', i)
      const rakutenCount = getSafeNumber(csvRow['楽天市場'], '楽天市場', i)
      const yahooCount = getSafeNumber(csvRow['Yahoo!'], 'Yahoo!', i)
      const mercariCount = getSafeNumber(csvRow['メルカリ'], 'メルカリ', i)
      const baseCount = getSafeNumber(csvRow['BASE'], 'BASE', i)
      const qoo10Count = getSafeNumber(csvRow['Qoo10'], 'Qoo10', i)

      // 🎯 特定商品の詳細ログ
      if (productName.includes("訳あり") && productName.includes("1Kg")) {
        console.log(`\n🎯 特定商品発見: "${productName}"`)
        console.log(`抽出された数量:`)
        console.log(`  Amazon: ${amazonCount} (元値: ${csvRow['Amazon']})`)
        console.log(`  楽天: ${rakutenCount} (元値: ${csvRow['楽天市場']})`) 
        console.log(`  Yahoo: ${yahooCount} (元値: ${csvRow['Yahoo!']})`)
        console.log(`  メルカリ: ${mercariCount} (元値: ${csvRow['メルカリ']})`)
        console.log(`  BASE: ${baseCount} (元値: ${csvRow['BASE']})`)
        console.log(`  Qoo10: ${qoo10Count} (元値: ${csvRow['Qoo10']})`)
        console.log(`  フロア: ${csvRow['フロア']} (参考値)`)
      }

      // 異常値チェック
      if (amazonCount > 10000 || rakutenCount > 10000 || yahooCount > 10000 || 
          mercariCount > 10000 || baseCount > 10000 || qoo10Count > 10000) {
        console.warn(`❌ 行 ${i}: 異常な数値を検出 - スキップ`)
        console.warn(`  Amazon:${amazonCount}, 楽天:${rakutenCount}, Yahoo:${yahooCount}, メルカリ:${mercariCount}, BASE:${baseCount}, Qoo10:${qoo10Count}`)
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

    // 🎯 最終確認: 特定商品のデータ
    const targetItem = parsedItems.find(item => 
      item.csvTitle.includes("訳あり") && item.csvTitle.includes("1Kg")
    )
    if (targetItem) {
      console.log("\n🎯 === 最終確認: 特定商品のパース結果 ===")
      console.log(JSON.stringify(targetItem, null, 2))
    }

    console.log('\n=== 汎用CSV Parse API完了 ===');
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
