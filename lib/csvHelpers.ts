// /lib/csvHelpers.ts ver.4 (Amazon/楽天/Yahoo 3チャネル対応 最終修正版)
// CSVを安全にパースする関数
export function parseCSVLine(line: string): string[] {
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
  // 安全なnullチェック
  if (!text || typeof text !== 'string') {
    return { productType: [], specifications: [], quantities: [], brands: [] }
  }
  
  const cleanText = text.toLowerCase()
  
  // 商品種別（最重要）
  const productType: string[] = []
  if (cleanText.includes('チャーシュー') && !cleanText.includes('たれ') && !cleanText.includes('ソース')) {
    productType.push('チャーシュー')
  }
  if (cleanText.includes('たれ') || cleanText.includes('専用だれ')) {
    productType.push('たれ')
  }
  if (cleanText.includes('つけ麺')) productType.push('つけ麺')
  if (cleanText.includes('ラーメン') && !cleanText.includes('たれ') && !cleanText.includes('ふりかけ')) {
    productType.push('ラーメン')
  }
  if (cleanText.includes('焼きそば')) productType.push('焼きそば')
  if (cleanText.includes('カレー')) productType.push('カレー')
  if (cleanText.includes('ドレッシング')) productType.push('ドレッシング')
  if (cleanText.includes('ソース') && !cleanText.includes('チャーシュー')) {
    productType.push('ソース')
  }
  if (cleanText.includes('スープ')) productType.push('スープ')
  if (cleanText.includes('ふりかけ')) productType.push('ふりかけ')
  if (cleanText.includes('馬刺し')) productType.push('馬刺し')
  if (cleanText.includes('米') || cleanText.includes('コシヒカリ')) productType.push('米')
  
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
  
  // 数量・セット情報（優先順位付き抽出）
  const quantities: string[] = []
  
  const setMatches = cleanText.match(/(\d+)[個]?セット/g) || []
  quantities.push(...setMatches)
  
  const packMatches = cleanText.match(/(\d+)パック/g) || []
  quantities.push(...packMatches)
  
  const foodMatches = cleanText.match(/(\d+)[食人前杯]/g) || []
  quantities.push(...foodMatches)
  
  if (setMatches.length === 0) {
    const unitMatches = cleanText.match(/(\d+)[枚本袋]/g) || []
    quantities.push(...unitMatches)
  }
  
  if (quantities.length === 0) {
    const pieceMatches = cleanText.match(/(\d+)個/g) || []
    quantities.push(...pieceMatches)
  }
  
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
  if (!text || typeof text !== 'string') return ''
  
  let frontPart = text.substring(0, maxLength)
    .toLowerCase()
    .replace(/[【】\[\]()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  
  const seoKeywords = ['訳あり', '常温', 'アウトドア', '備蓄食', '保存食', '送料無料', 'クリックポスト']
  seoKeywords.forEach(keyword => {
    frontPart = frontPart.replace(new RegExp(keyword, 'g'), ' ')
  })
  
  return frontPart.replace(/\s+/g, ' ').trim()
}

// 文字列類似度計算（Levenshtein距離ベース）
function getStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2 || typeof str1 !== 'string' || typeof str2 !== 'string') return 0
  if (str1 === str2) return 1
  
  const words1 = str1.split(' ').filter(w => w && w.length >= 2)
  const words2 = str2.split(' ').filter(w => w && w.length >= 2)
  
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
  const charSimilarity = 1 - (getEditDistance(str1, str2) / Math.max(str1.length, str2.length))
  
  return (wordSimilarity * 0.7 + charSimilarity * 0.3)
}

// 編集距離計算
function getEditDistance(str1: string, str2: string): number {
  if (!str1 || !str2 || typeof str1 !== 'string' || typeof str2 !== 'string') return Math.max(str1?.length || 0, str2?.length || 0)
  
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

// シンプル類似度マッチング関数（Amazon/楽天/Yahoo 3チャネル対応）
export function findBestMatchSimplified(productTitle: string, products: any[], learningData: any[] = []): any | null {
  if (!productTitle || typeof productTitle !== 'string' || !products || !Array.isArray(products) || products.length === 0) {
    console.log('無効な入力データ:', { productTitle: !!productTitle, productsLength: products?.length || 0 })
    return null
  }

  // 1. 学習データから完全一致をチェック
  const cleanProductTitle = productTitle.toLowerCase()
  let learnedMatch = null
  
  if (learningData && Array.isArray(learningData) && learningData.length > 0) {
    // Amazon学習データをチェック
    learnedMatch = learningData.find(entry => 
      entry && entry.amazon_title && typeof entry.amazon_title === 'string' &&
      entry.amazon_title.toLowerCase() === cleanProductTitle
    )
    
    // 楽天学習データをチェック（見つからない場合）
    if (!learnedMatch) {
      learnedMatch = learningData.find(entry => 
        entry && entry.rakuten_title && typeof entry.rakuten_title === 'string' &&
        entry.rakuten_title.toLowerCase() === cleanProductTitle
      )
    }

    // ★★★ ここからが修正箇所 ★★★
    // Yahoo学習データをチェック（見つからない場合）
    if (!learnedMatch) {
      learnedMatch = learningData.find(entry => 
        entry && entry.yahoo_title && typeof entry.yahoo_title === 'string' &&
        entry.yahoo_title.toLowerCase() === cleanProductTitle
      )
    }
    // ★★★ 修正箇所ここまで ★★★
    
    if (learnedMatch && learnedMatch.product_id) {
      const product = products.find(p => p && p.id === learnedMatch.product_id)
      if (product) {
        console.log('学習データからマッチング:', productTitle, '→', product.name)
        return { ...product, matchType: 'learned' }
      }
    }
  }

  // 商品の前半部分とキーワードを抽出
  const productFront = extractFrontPart(productTitle, 35)
  const productKeywords = extractImportantKeywords(productTitle)
  
  let bestMatch = null
  let bestScore = 0

  for (const product of products) {
    if (!product || !product.name || typeof product.name !== 'string') {
      continue
    }
    
    const masterFront = extractFrontPart(product.name, 35)
    const masterKeywords = extractImportantKeywords(product.name)
    
    let totalScore = 0
    const frontSimilarity = getStringSimilarity(productFront, masterFront)
    totalScore += frontSimilarity * 100

    let hasProductTypeMatch = false
    for (const inputType of productKeywords.productType) {
      if (masterKeywords.productType.includes(inputType)) {
        totalScore += 50
        hasProductTypeMatch = true
      }
    }
    
    if (!hasProductTypeMatch && productKeywords.productType.length > 0 && masterKeywords.productType.length > 0) {
      const inputTypes = productKeywords.productType
      const masterTypes = masterKeywords.productType
      if ((inputTypes.includes('チャーシュー') && masterTypes.includes('たれ')) ||
          (inputTypes.includes('ラーメン') && masterTypes.includes('ふりかけ')) ||
          (inputTypes.includes('ラーメン') && masterTypes.includes('ソース'))) {
        totalScore -= 100
      } else {
        totalScore -= 50
      }
    }

    for (const inputBrand of productKeywords.brands) {
      if (masterKeywords.brands.includes(inputBrand)) {
        totalScore += 40
      }
    }

    for (const inputSpec of productKeywords.specifications) {
      if (masterKeywords.specifications.includes(inputSpec)) {
        totalScore += 30
      }
    }

    let hasQuantityConflict = false
    if (productKeywords.quantities.length > 0) {
      if (masterKeywords.quantities.length > 0) {
        let hasQuantityMatch = false
        for (const inputQty of productKeywords.quantities) {
          if (masterKeywords.quantities.includes(inputQty)) {
            totalScore += 40
            hasQuantityMatch = true
            break
          }
        }
        if (!hasQuantityMatch) {
          totalScore -= 30
          hasQuantityConflict = true
        }
      } else {
        totalScore -= 5
      }
    } else if (masterKeywords.quantities.length > 0) {
      totalScore -= 5
    }
    
    if (productFront === masterFront) {
      totalScore += 100
    }
    
    const minScore = hasQuantityConflict ? 130 : 80
    if (totalScore >= minScore && totalScore > bestScore) {
      bestScore = totalScore
      bestMatch = { ...product, matchType: 'string' }
    }
  }

  return bestMatch
}
