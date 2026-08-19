// /app/api/import/csv-parse/route.ts ver.8
// 汎用CSV解析API（必要な列のみ処理版）

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findBestMatchSimplified } from '@/lib/csvHelpers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
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

// 必要な列の定義（列名をキーとして使用）
const REQUIRED_COLUMNS = {
  productName: ['商品名　　　2025.2更新', '商品名'],  // 複数パターン対応
  amazon: ['Amazon'],
  rakuten: ['楽天市場'],
  yahoo: ['Yahoo!'],
  mercari: ['メルカリ'],
  base: ['BASE'],
  qoo10: ['Qoo10']
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

// 列インデックスを見つける関数
function findColumnIndex(headers: string[], possibleNames: string[]): number {
  for (const name of possibleNames) {
    const index = headers.findIndex(h => h.trim() === name);
    if (index !== -1) return index;
  }
  return -1;
}

// 安全な数値取得関数
function getSafeNumber(value: any): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  
  // 数値型の場合
  if (typeof value === 'number') {
    return Math.floor(value); // 小数点以下切り捨て
  }
  
  // 文字列型の場合
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // カンマを除去してから数値変換
    const withoutComma = trimmed.replace(/,/g, '');
    return parseInt(withoutComma, 10) || 0;
  }
  
  return 0;
}

export async function POST(request: NextRequest) {
  try {
    console.log("=== 汎用CSV Parse API開始 (簡略化版 ver.8) ===")
    
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
    
    // 必要な列のインデックスを特定
    const columnIndices = {
      productName: findColumnIndex(headers, REQUIRED_COLUMNS.productName),
      amazon: findColumnIndex(headers, REQUIRED_COLUMNS.amazon),
      rakuten: findColumnIndex(headers, REQUIRED_COLUMNS.rakuten),
      yahoo: findColumnIndex(headers, REQUIRED_COLUMNS.yahoo),
      mercari: findColumnIndex(headers, REQUIRED_COLUMNS.mercari),
      base: findColumnIndex(headers, REQUIRED_COLUMNS.base),
      qoo10: findColumnIndex(headers, REQUIRED_COLUMNS.qoo10)
    }

    console.log("\n📍 列インデックス確認:")
    Object.entries(columnIndices).forEach(([key, index]) => {
      if (index === -1) {
        console.warn(`❌ ${key}列が見つかりません`);
      } else {
        console.log(`✅ ${key}: 列${String.fromCharCode(65 + index)} (index ${index}) = "${headers[index]}"`);
      }
    });

    // 商品名列が見つからない場合はエラー
    if (columnIndices.productName === -1) {
      return NextResponse.json({ error: '商品名列が見つかりません' }, { status: 400 })
    }

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
      
      if (values.length <= columnIndices.productName) {
        console.warn(`❌ 行 ${i}: データが不足しています`)
        continue
      }

      // 商品名の取得
      const productName = values[columnIndices.productName]?.trim()
      
      if (!isValidString(productName)) {
        console.warn(`❌ 行 ${i}: 商品名が空です`)
        continue
      }

      // 🎯 数量データ抽出（インデックスベース）
      const amazonCount = columnIndices.amazon !== -1 ? getSafeNumber(values[columnIndices.amazon]) : 0
      const rakutenCount = columnIndices.rakuten !== -1 ? getSafeNumber(values[columnIndices.rakuten]) : 0
      const yahooCount = columnIndices.yahoo !== -1 ? getSafeNumber(values[columnIndices.yahoo]) : 0
      const mercariCount = columnIndices.mercari !== -1 ? getSafeNumber(values[columnIndices.mercari]) : 0
      const baseCount = columnIndices.base !== -1 ? getSafeNumber(values[columnIndices.base]) : 0
      const qoo10Count = columnIndices.qoo10 !== -1 ? getSafeNumber(values[columnIndices.qoo10]) : 0

      // 🎯 特定商品の詳細ログ
      if (productName.includes("訳あり") && productName.includes("1Kg")) {
        console.log(`\n🎯 === 特定商品発見（行${i}） ===`)
        console.log(`商品名: "${productName}"`)
        console.log(`生データ: ${lines[i]}`)
        console.log(`\n列別の値:`)
        values.forEach((val, idx) => {
          const columnName = headers[idx] || `列${idx}`;
          console.log(`  [${idx}] ${columnName}: "${val}"`);
        });
        console.log(`\n抽出された数量:`)
        console.log(`  Amazon: ${amazonCount} (列${columnIndices.amazon}: "${values[columnIndices.amazon]}")`)
        console.log(`  楽天: ${rakutenCount} (列${columnIndices.rakuten}: "${values[columnIndices.rakuten]}")`)
        console.log(`  Yahoo: ${yahooCount} (列${columnIndices.yahoo}: "${values[columnIndices.yahoo]}")`)
        console.log(`  メルカリ: ${mercariCount} (列${columnIndices.mercari}: "${values[columnIndices.mercari]}")`)
        console.log(`  BASE: ${baseCount} (列${columnIndices.base}: "${values[columnIndices.base]}")`)
        console.log(`  Qoo10: ${qoo10Count} (列${columnIndices.qoo10}: "${values[columnIndices.qoo10]}")`)
      }

      // 異常値チェック
      if (amazonCount > 10000 || rakutenCount > 10000 || yahooCount > 10000 || 
          mercariCount > 10000 || baseCount > 10000 || qoo10Count > 10000) {
        console.warn(`❌ 行 ${i}: 異常な数値を検出 - スキップ`)
        continue
      }

      try {
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
      console.log("\n🎯 === API応答データ: 特定商品 ===")
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
