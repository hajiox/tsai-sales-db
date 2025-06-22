// /app/api/import/amazon-parse/route.ts ver.4 (API専用)
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

// 重要キーワードを抽出する関数
function extractImportantKeywords(text: string): {
  productType: string[],
  specifications: string[],
  quantities: string[],
  brands: string[]
} {
  const cleanText = text.toLowerCase()
  
  // 商品種別（最重要）
  const productType: string[] = []
  if (cleanText.includes('チャーシュー')) productType.push('チャーシュー')
  if (cleanText.includes('つけ麺')) productType.push('つけ麺')
  if (cleanText.includes('ラーメン')) productType.push('ラーメン')
  if (cleanText.includes('焼きそば')) productType.push('焼きそば')
  if (cleanText.includes('カレー')) productType.push('カレー')
  if (cleanText.includes('ドレッシング')) productType.push('ドレッシング')
  if (cleanText.includes('ソース')) productType.push('ソース')
  if (cleanText.includes('スープ')) productType.push('スープ')
  
  // 仕様・特徴（重要）
  const specifications: string[] = []
  if (cleanText.includes('極厚')) specifications.push('極厚')
  if (cleanText.includes('薄切り')) specifications.push('薄切り')
  if (cleanText.includes('中厚')) specifications.push('中厚')
  if (cleanText.includes('カット')) specifications.push('カット')
  if (cleanText.includes('スライス')) specifications.push('スライス')
  if (cleanText.includes('極太')) specifications.push('極太')
  if (cleanText.includes('中太')) specifications.push('中太')
  if (cleanText.includes('細麺')) specifications.push('細麺')
  if (cleanText.includes('激辛')) specifications.push('激辛')
  if (cleanText.includes('特濃')) specifications.push('特濃')
  if (cleanText.includes('濃厚')) specifications.push('濃厚')
  
  // 数量・セット情報
  const quantities: string[] = []
  const quantityMatches = cleanText.match(/(\d+)[食個枚本袋パック人前セット杯]/g) || []
  quantities.push(...quantityMatches)
  
  // ブランド・シリーズ
  const brands: string[] = []
  if (cleanText.includes('パーフェクトラーメン')) brands.push('パーフェクトラーメン')
  if (cleanText.includes('喜多方')) brands.push('喜多方')
  if (cleanText.includes('辛杉家')) brands.push('辛杉家')
  if (cleanText.includes('二郎')) brands.push('二郎')
  if (cleanText.includes('家系')) brands.push('家系')
  if (cleanText.includes('会津')) brands.push('会津')
  
  return { productType, specifications, quantities, brands }
}

// 前半部分を抽出（重要部分のみ）
function extractFrontPart(text: string, maxLength: number = 35): string {
  // 前半部分を取得し、SEOキーワードを除去
  let frontPart = text.substring(0, maxLength)
    .toLowerCase()
    .replace(/[【】\[\]()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  
  // 明らかなSEOキーワードを除去
  const seoKeywords = ['訳あり', '常温', 'アウトドア', '備蓄食', '保存食', '送料無料', 'クリックポスト']
  seoKeywords.forEach(keyword => {
    frontPart = frontPart.replace(new RegExp(keyword, 'g'), ' ')
  })
  
  return frontPart.replace(/\s+/g, ' ').trim()
}

// シンプル類似度マッチング関数（改良版）
function findBestMatchSimplified(amazonTitle: string, products: any[], learningData: any[] = []): any | null {
  if (!amazonTitle || !products.length) return null

  console.log('\n=== シンプルマッチング開始 ===')
  console.log('Amazon商品:', amazonTitle)

  // 1. 学習データから完全一致をチェック
  const cleanAmazonTitle = amazonTitle.toLowerCase()
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

  // Amazon商品の前半部分とキーワードを抽出
  const amazonFront = extractFrontPart(amazonTitle, 35)
  const amazonKeywords = extractImportantKeywords(amazonTitle)
  
  console.log('Amazon前半部分:', amazonFront)
  console.log('Amazonキーワード:', amazonKeywords)

  let bestMatch = null
  let bestScore = 0

  for (const product of products) {
    const productFront = extractFrontPart(product.name, 35)
    const productKeywords = extractImportantKeywords(product.name)
    
    console.log(`\n--- 商品: ${product.name} ---`)
    console.log('商品前半部分:', productFront)
    console.log('商品キーワード:', productKeywords)

    let totalScore = 0

    // 1. 前半部分の文字列類似度（基本スコア）
    const frontSimilarity = getStringSimilarity(amazonFront, productFront)
    const frontScore = frontSimilarity * 100
    totalScore += frontScore
    console.log(`前半類似度: ${frontSimilarity.toFixed(3)} (${frontScore}点)`)

    // 2. 商品種別マッチング（最重要 - 必須条件）
    let productTypeScore = 0
    let hasProductTypeMatch = false
    for (const amazonType of amazonKeywords.productType) {
      if (productKeywords.productType.includes(amazonType)) {
        productTypeScore += 50
        hasProductTypeMatch = true
        console.log(`商品種別一致: ${amazonType} (+50点)`)
      }
    }
    
    // 商品種別が一致しない場合は大幅減点
    if (!hasProductTypeMatch && amazonKeywords.productType.length > 0 && productKeywords.productType.length > 0) {
      productTypeScore = -50
      console.log('商品種別不一致 (-50点)')
    }
    totalScore += productTypeScore

    // 3. ブランド・シリーズマッチング（高重要）
    let brandScore = 0
    for (const amazonBrand of amazonKeywords.brands) {
      if (productKeywords.brands.includes(amazonBrand)) {
        brandScore += 40
        console.log(`ブランド一致: ${amazonBrand} (+40点)`)
      }
    }
    totalScore += brandScore

    // 4. 仕様・特徴マッチング（重要）
    let specScore = 0
    for (const amazonSpec of amazonKeywords.specifications) {
      if (productKeywords.specifications.includes(amazonSpec)) {
        specScore += 30
        console.log(`仕様一致: ${amazonSpec} (+30点)`)
      }
    }
    totalScore += specScore

    // 5. 数量マッチング（重要 - 同商品の区別のため）
    let quantityScore = 0
    let hasQuantityMatch = false
    let hasQuantityConflict = false
    
    // Amazon側に数量情報がある場合
    if (amazonKeywords.quantities.length > 0) {
      if (productKeywords.quantities.length > 0) {
        // 両方に数量情報がある場合は厳密チェック
        for (const amazonQty of amazonKeywords.quantities) {
          if (productKeywords.quantities.includes(amazonQty)) {
            quantityScore += 40
            hasQuantityMatch = true
            console.log(`数量一致: ${amazonQty} (+40点)`)
          }
        }
        
        // 数量情報があるのに一致しない場合は減点（同商品の違うセット）
        if (!hasQuantityMatch) {
          quantityScore = -30
          hasQuantityConflict = true
          console.log(`数量不一致 (-30点) Amazon:${amazonKeywords.quantities.join(',')} vs 商品:${productKeywords.quantities.join(',')}`)
        }
      } else {
        // 商品側に数量情報がない場合は軽微減点
        quantityScore = -5
        console.log('商品側に数量情報なし (-5点)')
      }
    } else if (productKeywords.quantities.length > 0) {
      // Amazon側に数量情報がない場合は軽微減点
      quantityScore = -5
      console.log('Amazon側に数量情報なし (-5点)')
    }
    
    totalScore += quantityScore

    // 6. 完全一致ボーナス
    if (amazonFront === productFront) {
      totalScore += 100
      console.log('前半完全一致ボーナス (+100点)')
    }

    console.log(`最終スコア: ${totalScore}`)

    // マッチング条件（数量考慮）
    const minScore = hasProductTypeMatch ? 80 : 120 // 商品種別一致なら条件緩和
    const minFrontSimilarity = 0.2 // 20%以上の文字列類似度
    
    // 数量不一致がある場合は高いスコアが必要
    const adjustedMinScore = hasQuantityConflict ? minScore + 50 : minScore

    if (totalScore >= adjustedMinScore && frontSimilarity >= minFrontSimilarity && totalScore > bestScore) {
      bestScore = totalScore
      
      // 信頼度判定（数量マッチング考慮）
      let confidence = 'low'
      if (totalScore >= 200 && hasQuantityMatch) {
        confidence = 'exact'
      } else if (totalScore >= 150 && hasProductTypeMatch && !hasQuantityConflict) {
        confidence = 'high'
      } else if (totalScore >= 100 && !hasQuantityConflict) {
        confidence = 'medium'
      } else if (hasQuantityConflict) {
        confidence = 'low' // 数量不一致は信頼度を下げる
      }
      
      bestMatch = { ...product, matchType: confidence }
    }
  }

  if (bestMatch) {
    console.log(`\n最終マッチング: ${amazonTitle} → ${bestMatch.name}`)
    console.log(`スコア: ${bestScore}, 信頼度: ${bestMatch.matchType}`)
  } else {
    console.log('\nマッチング失敗')
  }

  return bestMatch
}

// 文字列類似度計算（Levenshtein距離ベース）
function getStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0
  if (str1 === str2) return 1
  
  // 単語レベルでの比較も併用
  const words1 = str1.split(' ').filter(w => w.length >= 2)
  const words2 = str2.split(' ').filter(w => w.length >= 2)
  
  let wordMatches = 0
  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1 === word2 || word1.includes(word2) || word2.includes(word1)) {
        wordMatches++
        break
      }
    }
  }
  
  const wordSimilarity = words1.length > 0 ? wordMatches / words1.length : 0
  
  // 文字レベルの類似度
  const charSimilarity = 1 - (getEditDistance(str1, str2) / Math.max(str1.length, str2.length))
  
  // 単語類似度と文字類似度の加重平均
  return (wordSimilarity * 0.7 + charSimilarity * 0.3)
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
    console.log('Amazon CSV解析開始 (シンプル前半重視)')

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

      // シンプルマッチング実行
      const matchedProduct = findBestMatchSimplified(amazonTitle, products || [], learningData || [])

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

    console.log('シンプルマッチング結果:', {
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
