// /app/api/import/amazon-parse/route.ts ver.2
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

// 商品名マッチング関数（改良版 - 先頭25文字重視＋緩和条件）
function findBestMatch(amazonTitle: string, products: any[], learningData: any[] = []): any | null {
  if (!amazonTitle || !products.length) return null

  const cleanAmazonTitle = amazonTitle
    .toLowerCase()
    .replace(/[【】\[\]()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // 先頭25文字を重要部分として抽出
  const amazonTitleCore = cleanAmazonTitle.substring(0, 25).trim()
  const amazonTitleFull = cleanAmazonTitle

  console.log('マッチング対象:', amazonTitleFull)
  console.log('重要部分（先頭25文字）:', amazonTitleCore)

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

  let bestMatch = null
  let bestScore = 0

  // Amazon商品名から重要キーワードを抽出
  const amazonWordsCore = amazonTitleCore.split(' ').filter(w => w.length >= 2)
  const amazonWordsFull = amazonTitleFull.split(' ').filter(w => w.length >= 2)

  console.log('コア部分キーワード:', amazonWordsCore)
  console.log('全体キーワード:', amazonWordsFull)

  for (const product of products) {
    const productName = product.name.toLowerCase()
    const productWords = productName.split(' ').filter(w => w.length >= 2)
    
    // 2. 完全一致チェック（コア部分優先）
    if (productName === amazonTitleCore || productName === amazonTitleFull) {
      console.log('完全一致:', product.name)
      return { ...product, matchType: 'exact' }
    }

    let score = 0
    let coreMatchedWords = 0
    let fullMatchedWords = 0
    
    // 3. 重要キーワードの特定
    const importantKeywords = ['チャーシュー', 'ラーメン', 'レトルト', 'ドレッシング', 'サラダ', '極厚', '薄切り', 'カット', 'スライス', 'つけ麺', 'スープ', 'パーフェクト']
    
    // 4. コア部分（先頭25文字）のマッチング（高重み）
    for (const amazonWord of amazonWordsCore) {
      let wordMatched = false
      
      for (const productWord of productWords) {
        // 完全一致の単語（高得点）
        if (amazonWord === productWord) {
          score += amazonWord.length * 10 // コア部分は高得点
          wordMatched = true
          break
        }
        // 包含関係（中得点）
        else if (productWord.includes(amazonWord) && amazonWord.length >= 2) {
          score += amazonWord.length * 5
          wordMatched = true
        }
        else if (amazonWord.includes(productWord) && productWord.length >= 2) {
          score += productWord.length * 3
          wordMatched = true
        }
        // 類似度チェック（部分文字列の類似）
        else if (amazonWord.length >= 3 && productWord.length >= 3) {
          const similarity = getSimilarity(amazonWord, productWord)
          if (similarity >= 0.8) {
            score += similarity * amazonWord.length * 4
            wordMatched = true
          }
        }
      }
      
      // 重要キーワードボーナス（コア部分）
      if (wordMatched && importantKeywords.some(keyword => amazonWord.includes(keyword) || keyword.includes(amazonWord))) {
        score += 15
      }
      
      if (wordMatched) {
        coreMatchedWords++
      }
    }

    // 5. 全体部分のマッチング（低重み）
    for (const amazonWord of amazonWordsFull) {
      // コア部分で既にチェック済みの単語はスキップ
      if (amazonWordsCore.includes(amazonWord)) continue
      
      let wordMatched = false
      
      for (const productWord of productWords) {
        // 完全一致の単語
        if (amazonWord === productWord) {
          score += amazonWord.length * 2 // 後半部分は低得点
          wordMatched = true
          break
        }
        // 包含関係
        else if (productWord.includes(amazonWord) && amazonWord.length >= 3) {
          score += amazonWord.length * 1
          wordMatched = true
        }
      }
      
      if (wordMatched) {
        fullMatchedWords++
      }
    }

    // 6. マッチ率の計算（コア部分重視）
    const coreMatchRatio = amazonWordsCore.length > 0 ? coreMatchedWords / amazonWordsCore.length : 0
    const fullMatchRatio = amazonWordsFull.length > 0 ? (coreMatchedWords + fullMatchedWords) / amazonWordsFull.length : 0
    
    // 7. 商品固有の特徴をチェック
    let specificityBonus = 0
    
    // チャーシューの種類判定
    if (amazonTitleFull.includes('極厚') && productName.includes('極厚')) {
      specificityBonus += 20
    } else if (amazonTitleFull.includes('薄切り') && productName.includes('薄切り')) {
      specificityBonus += 20
    } else if (amazonTitleFull.includes('カット') && productName.includes('カット')) {
      specificityBonus += 15
    }
    
    // 商品種別判定
    if (amazonTitleFull.includes('つけ麺') && productName.includes('つけ麺')) {
      specificityBonus += 25
    } else if (amazonTitleFull.includes('ラーメン') && productName.includes('ラーメン')) {
      specificityBonus += 20
    }
    
    // 容量・枚数の一致
    const amazonNumbers = amazonTitleFull.match(/\d+/g) || []
    const productNumbers = productName.match(/\d+/g) || []
    
    for (const amazonNum of amazonNumbers) {
      if (productNumbers.includes(amazonNum)) {
        specificityBonus += 8
      }
    }

    // 8. 商品名の長さ類似度ボーナス
    const lengthSimilarity = 1 - Math.abs(amazonTitleCore.length - productName.length) / Math.max(amazonTitleCore.length, productName.length)
    if (lengthSimilarity > 0.7) {
      specificityBonus += lengthSimilarity * 10
    }

    // 最終スコア計算
    const finalScore = score + specificityBonus

    // マッチング条件を緩和（先頭25文字重視）
    const minCoreMatchRatio = 0.25 // コア部分の25%以上マッチ（緩和）
    const minFullMatchRatio = 0.15 // 全体の15%以上マッチ（大幅緩和）
    const minScore = Math.max(amazonTitleCore.length * 0.2, 5) // 最小スコアも緩和
    
    console.log(`商品: ${product.name}`)
    console.log(`  スコア: ${finalScore}, コアマッチ率: ${coreMatchRatio.toFixed(2)}, 全体マッチ率: ${fullMatchRatio.toFixed(2)}`)
    console.log(`  コアマッチ単語: ${coreMatchedWords}/${amazonWordsCore.length}, 全体マッチ単語: ${coreMatchedWords + fullMatchedWords}/${amazonWordsFull.length}`)
    
    // マッチング判定（緩和条件）
    const isValidMatch = (coreMatchRatio >= minCoreMatchRatio || fullMatchRatio >= minFullMatchRatio) && finalScore >= minScore
    
    if (isValidMatch && finalScore > bestScore) {
      bestScore = finalScore
      
      // 信頼度判定（コア部分重視）
      let confidence = 'low'
      if (coreMatchRatio >= 0.7 || (coreMatchRatio >= 0.5 && specificityBonus >= 15)) {
        confidence = 'high'
      } else if (coreMatchRatio >= 0.4 || (coreMatchRatio >= 0.3 && specificityBonus >= 10)) {
        confidence = 'medium'
      }
      
      bestMatch = { ...product, matchType: confidence }
    }
  }

  if (bestMatch) {
    console.log('最終マッチング:', amazonTitle, '→', bestMatch.name, 'スコア:', bestScore, 'タイプ:', bestMatch.matchType)
  } else {
    console.log('マッチング失敗:', amazonTitle)
  }

  return bestMatch
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
    console.log('Amazon CSV解析開始')

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

      // 商品マッチング実行（改良版アルゴリズム）
      const matchedProduct = findBestMatch(amazonTitle, products || [], learningData || [])

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

    console.log('マッチング結果:', {
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
