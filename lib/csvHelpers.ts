// /lib/csvHelpers.ts ver.3 (Amazon/楽天統一版)
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
  
  // 1. セット情報を優先（最も重要）
  const setMatches = cleanText.match(/(\d+)[個]?セット/g) || []
  quantities.push(...setMatches)
  
  // 2. パック情報
  const packMatches = cleanText.match(/(\d+)パック/g) || []
  quantities.push(...packMatches)
  
  // 3. 食事関連
  const foodMatches = cleanText.match(/(\d+)[食人前杯]/g) || []
  quantities.push(...foodMatches)
  
  // 4. 個別単位（セット情報がない場合のみ）
  if (setMatches.length === 0) {
    const unitMatches = cleanText.match(/(\d+)[枚本袋]/g) || []
    quantities.push(...unitMatches)
  }
  
  // 5. 個数（他の情報がない場合のみ）
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
  // 安全なnullチェック
  if (!text || typeof text !== 'string') return ''
  
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

// 文字列類似度計算（Levenshtein距離ベース）
function getStringSimilarity(str1: string, str2: string): number {
  // 安全なnullチェック
  if (!str1 || !str2 || typeof str1 !== 'string' || typeof str2 !== 'string') return 0
  if (str1 === str2) return 1
  
  // 単語レベルでの比較も併用
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
  
  // 文字レベルの類似度
  const charSimilarity = 1 - (getEditDistance(str1, str2) / Math.max(str1.length, str2.length))
  
  // 単語類似度と文字類似度の加重平均
  return (wordSimilarity * 0.7 + charSimilarity * 0.3)
}

// 編集距離計算
function getEditDistance(str1: string, str2: string): number {
  // 安全なnullチェック
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

// シンプル類似度マッチング関数（Amazon/楽天統一版）
export function findBestMatchSimplified(productTitle: string, products: any[], learningData: any[] = []): any | null {
  // 安全なnullチェック
  if (!productTitle || typeof productTitle !== 'string' || !products || !Array.isArray(products) || products.length === 0) {
    console.log('無効な入力データ:', { productTitle: !!productTitle, productsLength: products?.length || 0 })
    return null
  }

  console.log('\n=== シンプルマッチング開始 ===')
  console.log('商品名:', productTitle)

  // 1. 学習データから完全一致をチェック（Amazon/楽天両対応）
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
  
  console.log('前半部分:', productFront)
  console.log('キーワード:', productKeywords)

  let bestMatch = null
  let bestScore = 0

  for (const product of products) {
    // 商品データの安全性チェック
    if (!product || !product.name || typeof product.name !== 'string') {
      console.log('無効な商品データをスキップ:', product)
      continue
    }
    
    const masterFront = extractFrontPart(product.name, 35)
    const masterKeywords = extractImportantKeywords(product.name)
    
    console.log(`\n--- 商品: ${product.name} ---`)
    console.log('商品前半部分:', masterFront)
    console.log('商品キーワード:', masterKeywords)

    let totalScore = 0

    // 1. 前半部分の文字列類似度（基本スコア）
    const frontSimilarity = getStringSimilarity(productFront, masterFront)
    const frontScore = frontSimilarity * 100
    totalScore += frontScore
    console.log(`前半類似度: ${frontSimilarity.toFixed(3)} (${frontScore}点)`)

    // 2. 商品種別マッチング（最重要 - 必須条件）
    let productTypeScore = 0
    let hasProductTypeMatch = false
    let hasProductTypeConflict = false
    
    for (const inputType of productKeywords.productType) {
      if (masterKeywords.productType.includes(inputType)) {
        productTypeScore += 50
        hasProductTypeMatch = true
        console.log(`商品種別一致: ${inputType} (+50点)`)
      }
    }
    
    // 商品種別が完全に異なる場合は大幅減点
    if (!hasProductTypeMatch && productKeywords.productType.length > 0 && masterKeywords.productType.length > 0) {
      // 特に危険な組み合わせをチェック
      const inputTypes = productKeywords.productType
      const masterTypes = masterKeywords.productType
      
      if ((inputTypes.includes('チャーシュー') && masterTypes.includes('たれ')) ||
          (inputTypes.includes('ラーメン') && masterTypes.includes('ふりかけ')) ||
          (inputTypes.includes('ラーメン') && masterTypes.includes('ソース'))) {
        productTypeScore = -100 // 完全に異なる商品は大幅減点
        hasProductTypeConflict = true
        console.log(`商品種別重大不一致 (-100点): 入力[${inputTypes.join(',')}] vs 商品[${masterTypes.join(',')}]`)
      } else {
        productTypeScore = -50
        console.log('商品種別不一致 (-50点)')
      }
    }
    totalScore += productTypeScore

    // 3. ブランド・シリーズマッチング（高重要）
    let brandScore = 0
    for (const inputBrand of productKeywords.brands) {
      if (masterKeywords.brands.includes(inputBrand)) {
        brandScore += 40
        console.log(`ブランド一致: ${inputBrand} (+40点)`)
      }
    }
    totalScore += brandScore

    // 4. 仕様・特徴マッチング（重要）
    let specScore = 0
    for (const inputSpec of productKeywords.specifications) {
      if (masterKeywords.specifications.includes(inputSpec)) {
        specScore += 30
        console.log(`仕様一致: ${inputSpec} (+30点)`)
      }
    }
    totalScore += specScore

    // 5. 数量マッチング（重要 - 同商品の区別のため）
    let quantityScore = 0
    let hasQuantityMatch = false
    let hasQuantityConflict = false
    
    console.log(`入力数量: [${productKeywords.quantities.join(', ')}]`)
    console.log(`商品数量: [${masterKeywords.quantities.join(', ')}]`)
    
    // 入力側に数量情報がある場合
    if (productKeywords.quantities.length > 0) {
      if (masterKeywords.quantities.length > 0) {
        // 完全一致をチェック
        for (const inputQty of productKeywords.quantities) {
          for (const masterQty of masterKeywords.quantities) {
            if (inputQty === masterQty) {
              quantityScore += 40
              hasQuantityMatch = true
              console.log(`数量完全一致: ${inputQty} (+40点)`)
            }
          }
        }
        
        // 数量情報があるのに一致しない場合は厳格チェック
        if (!hasQuantityMatch) {
          // セット数の不一致は特に厳格に
          const inputHasSet = productKeywords.quantities.some(q => q.includes('セット'))
          const masterHasSet = masterKeywords.quantities.some(q => q.includes('セット'))
          
          if (inputHasSet || masterHasSet) {
            quantityScore = -50 // セット数不一致は大幅減点
            hasQuantityConflict = true
            console.log(`セット数不一致 (-50点)`)
          } else {
            quantityScore = -30
            hasQuantityConflict = true
            console.log(`数量不一致 (-30点)`)
          }
        }
      } else {
        // 商品側に数量情報がない場合は軽微減点
        quantityScore = -5
        console.log('商品側に数量情報なし (-5点)')
      }
    } else if (masterKeywords.quantities.length > 0) {
      // 入力側に数量情報がない場合は軽微減点
      quantityScore = -5
      console.log('入力側に数量情報なし (-5点)')
    }
    
    totalScore += quantityScore

    // 6. 完全一致ボーナス
    if (productFront === masterFront) {
      totalScore += 100
      console.log('前半完全一致ボーナス (+100点)')
    }

    console.log(`最終スコア: ${totalScore}`)

    // マッチング条件（商品種別重視）
    const minScore = hasProductTypeMatch ? 80 : 150 // 商品種別一致なら条件緩和、不一致なら厳格化
    const minFrontSimilarity = 0.2 // 20%以上の文字列類似度
    
    // 商品種別が重大に異なる場合は除外
    if (hasProductTypeConflict) {
      console.log('商品種別重大不一致により除外')
      continue
    }
    
    // 数量不一致がある場合は高いスコアが必要
    const adjustedMinScore = hasQuantityConflict ? minScore + 50 : minScore

    if (totalScore >= adjustedMinScore && frontSimilarity >= minFrontSimilarity && totalScore > bestScore) {
      bestScore = totalScore
      
      // 信頼度判定（商品種別重視）
      let confidence = 'low'
      if (totalScore >= 200 && hasQuantityMatch && hasProductTypeMatch) {
        confidence = 'exact'
      } else if (totalScore >= 150 && hasProductTypeMatch && !hasQuantityConflict) {
        confidence = 'high'
      } else if (totalScore >= 100 && hasProductTypeMatch && !hasQuantityConflict) {
        confidence = 'medium'
      } else {
        confidence = 'low' // 商品種別不一致や数量不一致は信頼度低下
      }
      
      bestMatch = { ...product, matchType: confidence }
    }
  }

  if (bestMatch) {
    console.log(`\n最終マッチング: ${productTitle} → ${bestMatch.name}`)
    console.log(`スコア: ${bestScore}, 信頼度: ${bestMatch.matchType}`)
  } else {
    console.log('\nマッチング失敗')
  }

  return bestMatch
}
