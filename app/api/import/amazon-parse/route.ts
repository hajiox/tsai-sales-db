// /app/api/import/amazon-parse/route.ts ver.1
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

// 商品名マッチング関数（修正版 - より精密なマッチング）
function findBestMatch(amazonTitle: string, products: any[], learningData: any[] = []): any | null {
  if (!amazonTitle || !products.length) return null

  const cleanAmazonTitle = amazonTitle
    .toLowerCase()
    .replace(/[【】\[\]()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

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
  const amazonWords = cleanAmazonTitle.split(' ').filter(w => w.length >= 2)

  console.log('マッチング対象:', cleanAmazonTitle, 'キーワード:', amazonWords)

  for (const product of products) {
    const productName = product.name.toLowerCase()
    const productWords = productName.split(' ').filter(w => w.length >= 2)
    
    // 2. 完全一致チェック
    if (productName === cleanAmazonTitle) {
      console.log('完全一致:', product.name)
      return { ...product, matchType: 'exact' }
    }

    let score = 0
    let matchedWords = 0
    let totalWords = amazonWords.length

    // 3. 重要キーワードの特定
    const importantKeywords = ['チャーシュー', 'ラーメン', 'レトルト', 'ドレッシング', 'サラダ', '極厚', '薄切り', 'カット', 'スライス']
    
    // 4. 単語レベルマッチング（より厳密）
    for (const amazonWord of amazonWords) {
      let wordMatched = false
      
      for (const productWord of productWords) {
        // 完全一致の単語
        if (amazonWord === productWord) {
          score += amazonWord.length * 5 // 完全一致は高得点
          wordMatched = true
          break
        }
        // 包含関係
        else if (productWord.includes(amazonWord) && amazonWord.length >= 3) {
          score += amazonWord.length * 2
          wordMatched = true
        }
        else if (amazonWord.includes(productWord) && productWord.length >= 3) {
          score += productWord.length * 1.5
          wordMatched = true
        }
      }
      
      // 重要キーワードボーナス
      if (wordMatched && importantKeywords.includes(amazonWord)) {
        score += 10
      }
      
      if (wordMatched) {
        matchedWords++
      }
    }

    // 5. マッチ率の計算
    const matchRatio = totalWords > 0 ? matchedWords / totalWords : 0
    
    // 6. 商品固有の特徴をチェック
    let specificityBonus = 0
    
    // チャーシューの種類判定
    if (cleanAmazonTitle.includes('極厚') && productName.includes('極厚')) {
      specificityBonus += 15
    } else if (cleanAmazonTitle.includes('薄切り') && productName.includes('薄切り')) {
      specificityBonus += 15
    } else if (cleanAmazonTitle.includes('カット') && productName.includes('カット')) {
      specificityBonus += 10
    }
    
    // 容量・枚数の一致
    const amazonNumbers = cleanAmazonTitle.match(/\d+/g) || []
    const productNumbers = productName.match(/\d+/g) || []
    
    for (const amazonNum of amazonNumbers) {
      if (productNumbers.includes(amazonNum)) {
        specificityBonus += 5
      }
    }

    // 最終スコア計算
    const finalScore = score + specificityBonus

    // マッチング条件を厳格化
    const minMatchRatio = 0.4 // 40%以上の単語がマッチ
    const minScore = Math.max(cleanAmazonTitle.length * 0.3, 10)
    
    console.log(`商品: ${product.name}, スコア: ${finalScore}, マッチ率: ${matchRatio.toFixed(2)}, マッチ単語: ${matchedWords}/${totalWords}`)
    
    if (finalScore > bestScore && matchRatio >= minMatchRatio && finalScore >= minScore) {
      bestScore = finalScore
      const confidence = matchRatio >= 0.7 ? 'high' : matchRatio >= 0.5 ? 'medium' : 'low'
      bestMatch = { ...product, matchType: confidence }
    }
  }

  if (bestMatch) {
    console.log('最終マッチング:', amazonTitle, '→', bestMatch.name, 'スコア:', bestScore)
  } else {
    console.log('マッチング失敗:', amazonTitle)
  }

  return bestMatch
}

// 文字列類似度計算関数（新規追加）
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

      // 商品マッチング実行（学習データ付き）
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
      unmatchedProducts: unmatchedProducts.slice(0, 10),
      summary: {
        totalRows: csvData.length - 1,
        matchedCount: matchedResults.length,
        unmatchedCount: unmatchedProducts.length
      }
    })

  } catch (error) {
    console.error('Amazon CSV解析エラー:', error)
    return NextResponse.json({ 
      error: 'CSV解析中にエラーが発生しました: ' + (error as Error).message 
    }, { status: 500 })
  }
}
