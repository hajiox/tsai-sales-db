// /app/api/import/amazon-parse/route.ts ver.3
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export const dynamic = 'force-dynamic'

// CSVを安全にパースする関数
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i += 2
        continue
      }
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
    i++
  }
  result.push(current.trim())
  return result
}

// 入り数・セット数を抽出する関数
function extractQuantityInfo(text: string): {
  numbers: number[],
  setKeywords: string[],
  foodKeywords: string[],
  isSet: boolean,
  isPack: boolean
} {
  const cleanText = text.toLowerCase()
  
  // 数字を抽出（1桁〜3桁）
  const numberMatches = cleanText.match(/(\d{1,3})[個食枚本袋パック人前セット]/g) || []
  const pureNumbers = cleanText.match(/\b(\d{1,3})\b/g) || []
  
  const numbers: number[] = []
  
  // セット・パック関連の数字を優先
  numberMatches.forEach(match => {
    const num = parseInt(match.match(/\d+/)?.[0] || '0')
    if (num > 0 && num <= 100) numbers.push(num)
  })
  
  // 単独数字も追加（重複除去）
  pureNumbers.forEach(numStr => {
    const num = parseInt(numStr)
    if (num > 0 && num <= 100 && !numbers.includes(num)) {
      numbers.push(num)
    }
  })

  // セット関連キーワード
  const setKeywords: string[] = []
  if (cleanText.includes('セット')) setKeywords.push('セット')
  if (cleanText.includes('パック')) setKeywords.push('パック')
  if (cleanText.includes('袋')) setKeywords.push('袋')
  if (cleanText.includes('個入')) setKeywords.push('個入')
  
  // 食事関連キーワード  
  const foodKeywords: string[] = []
  if (cleanText.includes('食')) foodKeywords.push('食')
  if (cleanText.includes('人前')) foodKeywords.push('人前')
  if (cleanText.includes('杯')) foodKeywords.push('杯')

  return {
    numbers,
    setKeywords,
    foodKeywords,
    isSet: setKeywords.length > 0,
    isPack: cleanText.includes('パック') || cleanText.includes('袋'),
  }
}

// 商品名の基本部分を抽出（入り数情報を除去）
function extractBaseProductName(text: string): string {
  let baseName = text.toLowerCase()
    .replace(/[【】\[\]()（）]/g, ' ')
    .replace(/\d+[個食枚本袋パック人前セット杯]/g, ' ') // 数字+単位を除去
    .replace(/\d+セット/g, ' ') // Nセットを除去
    .replace(/\bセット\b/g, ' ') // 単独のセットを除去
    .replace(/\bパック\b/g, ' ') // 単独のパックを除去
    .replace(/[、。]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  
  // 先頭25文字を重要部分として使用
  return baseName.substring(0, 25).trim()
}

// 2段階マッチング関数
function findBestMatchTwoStage(amazonTitle: string, products: any[], learningData: any[] = []): any | null {
  if (!amazonTitle || !products.length) return null

  const cleanAmazonTitle = amazonTitle.toLowerCase()
  console.log('\n=== 2段階マッチング開始 ===')
  console.log('Amazon商品:', amazonTitle)

  // 1. 学習データから完全一致をチェック
  const learnedMatch = learningData.find(entry => 
    entry.amazon_title.toLowerCase() === cleanAmazonTitle
  )
  if (learnedMatch) {
    const product = products.find(p => p.id === learnedMatch.product_id)
    if (product) {
      console.log('学習データからマッチング:', amazonTitle, '→', product.name)
      return { ...product, matchType: 'learned' }
    }
  }

  // Amazon商品の情報を抽出
  const amazonBaseProduct = extractBaseProductName(amazonTitle)
  const amazonQuantityInfo = extractQuantityInfo(amazonTitle)
  
  console.log('Amazon基本商品名:', amazonBaseProduct)
  console.log('Amazon入り数情報:', amazonQuantityInfo)

  // 候補商品を基本商品名でフィルタリング（第1段階）
  const stage1Candidates: Array<{product: any, score: number, baseMatch: boolean}> = []
  
  for (const product of products) {
    const productBaseProduct = extractBaseProductName(product.name)
    const similarity = calculateBaseSimilarity(amazonBaseProduct, productBaseProduct)
    
    console.log(`商品: ${product.name}`)
    console.log(`  基本名: ${productBaseProduct}`)
    console.log(`  基本類似度: ${similarity.toFixed(3)}`)
    
    // 基本商品名の類似度が一定以上の場合は候補に追加
    if (similarity >= 0.3) { // 30%以上の類似度
      stage1Candidates.push({
        product,
        score: similarity,
        baseMatch: similarity >= 0.7 // 70%以上は高い基本マッチ
      })
    }
  }

  console.log(`第1段階候補: ${stage1Candidates.length}件`)

  if (stage1Candidates.length === 0) {
    console.log('第1段階で候補なし')
    return null
  }

  // 第2段階: 入り数・セット数での精密マッチング
  let bestMatch = null
  let bestScore = 0

  for (const candidate of stage1Candidates) {
    const product = candidate.product
    const productQuantityInfo = extractQuantityInfo(product.name)
    
    console.log(`\n--- 第2段階: ${product.name} ---`)
    console.log('商品入り数情報:', productQuantityInfo)

    let stage2Score = candidate.score * 100 // 基本スコアを100倍

    // 入り数・セット数のマッチング
    let quantityMatchScore = 0
    let hasExactQuantityMatch = false

    // 数字の完全一致チェック
    for (const amazonNum of amazonQuantityInfo.numbers) {
      if (productQuantityInfo.numbers.includes(amazonNum)) {
        quantityMatchScore += 50 // 数字一致は高得点
        hasExactQuantityMatch = true
        console.log(`  数字一致: ${amazonNum}`)
      }
    }

    // セット・パック関連の一致
    let contextMatchScore = 0
    
    // セット関連の一致
    if (amazonQuantityInfo.isSet && productQuantityInfo.isSet) {
      contextMatchScore += 30
      console.log('  セット関連一致')
    }
    
    // 食事関連の一致
    if (amazonQuantityInfo.foodKeywords.length > 0 && productQuantityInfo.foodKeywords.length > 0) {
      const commonFoodKeywords = amazonQuantityInfo.foodKeywords.filter(k => 
        productQuantityInfo.foodKeywords.includes(k)
      )
      contextMatchScore += commonFoodKeywords.length * 20
      console.log(`  食事関連一致: ${commonFoodKeywords.join(', ')}`)
    }

    // パック関連の一致
    if (amazonQuantityInfo.isPack && productQuantityInfo.isPack) {
      contextMatchScore += 20
      console.log('  パック関連一致')
    }

    // 特別ボーナス: 基本商品名が高マッチ + 入り数完全一致
    let perfectMatchBonus = 0
    if (candidate.baseMatch && hasExactQuantityMatch) {
      perfectMatchBonus = 100
      console.log('  完璧マッチボーナス!')
    }

    // 最終スコア計算
    const finalScore = stage2Score + quantityMatchScore + contextMatchScore + perfectMatchBonus
    
    console.log(`  最終スコア: ${finalScore} (基本:${stage2Score} + 入り数:${quantityMatchScore} + 文脈:${contextMatchScore} + ボーナス:${perfectMatchBonus})`)

    // 最小スコア条件
    const minScore = candidate.baseMatch ? 150 : 200 // 基本マッチが良い場合は条件緩和

    if (finalScore >= minScore && finalScore > bestScore) {
      bestScore = finalScore
      
      // 信頼度判定
      let confidence = 'low'
      if (perfectMatchBonus > 0) {
        confidence = 'exact'
      } else if (hasExactQuantityMatch && candidate.baseMatch) {
        confidence = 'high'  
      } else if (hasExactQuantityMatch || candidate.baseMatch) {
        confidence = 'medium'
      }
      
      bestMatch = { ...product, matchType: confidence }
    }
  }

  if (bestMatch) {
    console.log(`\n最終マッチング: ${amazonTitle} → ${bestMatch.name}`)
    console.log(`スコア: ${bestScore}, 信頼度: ${bestMatch.matchType}`)
  } else {
    console.log('\n2段階マッチング失敗')
  }

  return bestMatch
}

// 基本商品名の類似度計算
function calculateBaseSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0
  
  const words1 = text1.split(' ').filter(w => w.length >= 2)
  const words2 = text2.split(' ').filter(w => w.length >= 2)
  
  if (words1.length === 0 || words2.length === 0) return 0
  
  let matchingWords = 0
  let totalScore = 0
  
  for (const word1 of words1) {
    let bestWordMatch = 0
    for (const word2 of words2) {
      if (word1 === word2) {
        bestWordMatch = 1
        break
      } else if (word1.includes(word2) || word2.includes(word1)) {
        bestWordMatch = Math.max(bestWordMatch, 0.7)
      } else {
        const similarity = getSimilarity(word1, word2)
        if (similarity >= 0.8) {
          bestWordMatch = Math.max(bestWordMatch, similarity * 0.6)
        }
      }
    }
    
    if (bestWordMatch > 0.5) {
      matchingWords++
      totalScore += bestWordMatch
    }
  }
  
  // マッチ率とスコアの加重平均
  const matchRatio = matchingWords / Math.max(words1.length, words2.length)
  const avgScore = matchingWords > 0 ? totalScore / matchingWords : 0
  
  return (matchRatio * 0.6 + avgScore * 0.4)
}

// 文字列類似度計算関数
function getSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const editDistance = getEditDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

// 編集距離計算
function getEditDistance(str1: string, str2: string): number {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

export async function POST(request: NextRequest) {
  try {
    console.log('Amazon CSV解析開始 (2段階マッチング)')

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    }

    console.log('ファイル受信:', file.name, 'サイズ:', file.size)

    // ファイル内容を読み込み
    const text = await file.text()
    console.log('ファイル内容長:', text.length)

    let csvData: string[][]

    try {
      // CSV解析
      const lines = text.split('\n').filter(line => line.trim())
      csvData = lines.map(line => parseCSVLine(line))
      console.log('CSV行数:', csvData.length)
    } catch (parseError) {
      console.error('CSV parse error:', parseError)
      return NextResponse.json({ error: 'CSVファイルの形式が正しくありません' }, { status: 400 })
    }

    if (csvData.length < 2) {
      return NextResponse.json({ error: 'CSVデータが不足しています（ヘッダー+データ行が必要）' }, { status: 400 })
    }

    // ヘッダー行を取得
    const headers = csvData[0]
    console.log('CSV Headers:', headers)

    // 必要な列のインデックスを特定
    const titleIndex = headers.findIndex(h => h.includes('タイトル'))
    const quantityIndex = headers.findIndex(h => h.includes('注文された商品点数'))

    console.log('タイトル列インデックス:', titleIndex)
    console.log('販売数量列インデックス:', quantityIndex)

    if (titleIndex === -1 || quantityIndex === -1) {
      return NextResponse.json({ 
        error: `必要な列が見つかりません。利用可能な列: ${headers.join(', ')}`,
        headers: headers
      }, { status: 400 })
    }

    // 商品マスターデータを取得
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')

    if (productsError) {
      console.error('Products fetch error:', productsError)
      return NextResponse.json({ error: '商品データの取得に失敗しました' }, { status: 500 })
    }

    console.log('商品マスター件数:', products?.length || 0)

    // 学習データを取得（過去のマッチング履歴）
    const { data: learningData, error: learningError } = await supabase
      .from('amazon_product_mapping')
      .select('amazon_title, product_id')

    if (learningError) {
      console.log('学習データ取得エラー（スキップ）:', learningError.message)
    }

    console.log('学習データ件数:', learningData?.length || 0)

    // データ行を処理
    const matchedResults = []
    const unmatchedProducts = []

    for (let i = 1; i < csvData.length; i++) {
      const row = csvData[i]
      if (row.length <= Math.max(titleIndex, quantityIndex)) continue

      const amazonTitle = row[titleIndex]?.trim()
      const quantityStr = row[quantityIndex]?.trim()

      if (!amazonTitle || !quantityStr) continue

      const quantity = parseInt(quantityStr) || 0
      if (quantity <= 0) continue

      // 2段階マッチング実行
      const matchedProduct = findBestMatchTwoStage(amazonTitle, products || [], learningData || [])

      if (matchedProduct) {
        matchedResults.push({
          productId: matchedProduct.id,
          productName: matchedProduct.name,
          amazonTitle,
          quantity,
          matched: true,
          matchType: matchedProduct.matchType || 'medium'
        })
      } else {
        unmatchedProducts.push({
          amazonTitle,
          quantity,
          matched: false
        })
      }
    }

    console.log('2段階マッチング結果:', {
      matched: matchedResults.length,
      unmatched: unmatchedProducts.length
    })

    return NextResponse.json({
      matchedResults,
      unmatchedProducts: unmatchedProducts.slice(0, 50), // 最大50件表示
      summary: {
        totalRows: csvData.length - 1,
        matchedCount: matchedResults.length,
        unmatchedCount: unmatchedProducts.length,
        csvTotalQuantity: matchedResults.reduce((sum, r) => sum + r.quantity, 0) + unmatchedProducts.reduce((sum, r) => sum + r.quantity, 0),
        matchedQuantity: matchedResults.reduce((sum, r) => sum + r.quantity, 0),
        unmatchedQuantity: unmatchedProducts.reduce((sum, r) => sum + r.quantity, 0)
      }
    })

  } catch (error) {
    console.error('Amazon CSV解析エラー:', error)
    return NextResponse.json({ 
      error: 'CSV解析中にエラーが発生しました: ' + (error as Error).message 
    }, { status: 500 })
  }
}
