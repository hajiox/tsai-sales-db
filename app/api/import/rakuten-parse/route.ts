// /app/api/import/rakuten-parse/route.ts ver.1

import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 商品名の類似度を計算（楽天は前半40文字のみ使用）
function calculateSimilarity(rakutenTitle: string, productName: string): number {
  // 入力値の安全性チェック
  if (!rakutenTitle || !productName) {
    console.log('入力値エラー:', { rakutenTitle, productName });
    return 0;
  }
  
  // 楽天タイトルの前半40文字のみを取得
  const rakutenCore = rakutenTitle.substring(0, 40).trim();
  console.log('楽天コア部分:', rakutenCore);
  
  // テキストを正規化
  const normalizeText = (text: string) => {
    if (!text || typeof text !== 'string') return '';
    
    return text
      .toLowerCase()
      .replace(/<br>/g, ' ')
      .replace(/[【】（）()「」]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const rakutenNormalized = normalizeText(rakutenCore);
  const productNormalized = normalizeText(productName);
  
  console.log('正規化後 - 楽天:', rakutenNormalized);
  console.log('正規化後 - 商品:', productNormalized);

  // 正規化後の値をチェック
  if (!rakutenNormalized || !productNormalized) {
    console.log('正規化失敗');
    return 0;
  }

  // 商品名のキーワードを抽出（2文字以上）
  const productKeywords = productNormalized.split(' ').filter(word => word && word.length > 1);
  console.log('商品キーワード:', productKeywords);
  
  if (productKeywords.length === 0) {
    console.log('キーワードなし');
    return 0;
  }

  // 各キーワードが楽天タイトル（前半40文字）に含まれているかチェック
  let matchCount = 0;
  for (const keyword of productKeywords) {
    if (rakutenNormalized.includes(keyword)) {
      console.log('マッチしたキーワード:', keyword);
      matchCount++;
    } else {
      console.log('マッチしなかったキーワード:', keyword);
    }
  }

  // マッチ率を計算（0-1の範囲）
  const score = matchCount / productKeywords.length;
  console.log('最終スコア:', score, `(${matchCount}/${productKeywords.length})`);
  return score;
}

interface RakutenCSVRow {
  productName: string;
  quantity: number;
  originalRow: number;
}

interface ParseResult {
  success: boolean;
  data?: RakutenCSVRow[];
  matchedProducts?: Array<{
    rakutenTitle: string;
    productId: string;
    productInfo: any;
    quantity: number;
    originalRow: number;
  }>;
  unmatchedProducts?: Array<{
    rakutenTitle: string;
    quantity: number;
    originalRow: number;
  }>;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ParseResult>> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ success: false, error: 'ファイルが見つかりません' });
    }

    const csvText = await file.text();
    
    // CSVをパース（ヘッダー行を含む全行を取得）
    const parseResult = Papa.parse(csvText, {
      header: false,
      skipEmptyLines: true,
      encoding: 'UTF-8'
    });

    if (parseResult.errors.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: `CSV解析エラー: ${parseResult.errors[0].message}` 
      });
    }

    const rows = parseResult.data as string[][];
    
    // 8行目以降が商品データ（配列は0ベースなので index 7 以降）
    const productRows = rows.slice(7).filter(row => 
      row.length > 4 && 
      row[0] && 
      row[4] && 
      !isNaN(parseInt(row[4]))
    );

    // 楽天データを構造化
    const rakutenData: RakutenCSVRow[] = productRows.map((row, index) => ({
      productName: row[0].trim(),
      quantity: parseInt(row[4]),
      originalRow: index + 8 // 実際のCSV行番号
    }));

    // 既存の楽天商品マッピングを取得
    const { data: existingMappings } = await supabase
      .from('rakuten_product_mapping')
      .select('rakuten_title, product_id');

    const mappingMap = new Map(
      existingMappings?.map(m => [m.rakuten_title, m.product_id]) || []
    );

    // 商品マスターを取得
    const { data: products } = await supabase
      .from('products')
      .select('id, series, product_number, series_code, product_code');

    const productMap = new Map(
      products?.map(p => [p.id, p]) || []
    );

    // マッチング処理（部分マッチング機能付き）
    const matchedProducts = [];
    const unmatchedProducts = [];

    console.log('=== 楽天マッチング開始 ===');
    console.log('楽天商品数:', rakutenData.length);
    console.log('商品マスター数:', productMap.size);
    console.log('既存マッピング数:', mappingMap.size);

    for (const item of rakutenData) {
      console.log('\n--- 商品マッチング処理 ---');
      console.log('楽天商品名:', item.productName);
      console.log('楽天商品名(前40文字):', item.productName.substring(0, 40));
      
      const productId = mappingMap.get(item.productName);
      
      if (productId && productMap.has(productId)) {
        // 既存の学習データでマッチング
        console.log('既存マッピングでマッチ:', productId);
        matchedProducts.push({
          rakutenTitle: item.productName,
          productId: productId,
          productInfo: productMap.get(productId),
          quantity: item.quantity,
          originalRow: item.originalRow
        });
      } else {
        console.log('学習データなし、AIマッチング開始');
        // 学習データがない場合、商品名の部分マッチングを試行
        let bestMatch = null;
        let bestScore = 0;

        for (const [id, product] of productMap) {
          // 商品データの安全性チェック
          if (!product || !product.name) continue;
          
          const score = calculateSimilarity(item.productName, product.name);
          console.log(`商品: ${product.name} => スコア: ${score}`);
          
          if (score > bestScore && score > 0.3) { // 30%以上の類似度
            bestScore = score;
            bestMatch = { productId: id, productInfo: product };
            console.log(`新しいベストマッチ: ${product.name} (スコア: ${score})`);
          }
        }

        if (bestMatch) {
          console.log('AIマッチング成功:', bestMatch.productInfo.name, 'スコア:', bestScore);
          matchedProducts.push({
            rakutenTitle: item.productName,
            productId: bestMatch.productId,
            productInfo: bestMatch.productInfo,
            quantity: item.quantity,
            originalRow: item.originalRow,
            isAutoMatched: true, // 自動マッチングフラグ
            matchScore: bestScore
          });
        } else {
          console.log('マッチング失敗 - 未マッチリストに追加');
          unmatchedProducts.push({
            rakutenTitle: item.productName,
            quantity: item.quantity,
            originalRow: item.originalRow
          });
        }
      }
    }

    console.log('\n=== マッチング結果 ===');
    console.log('マッチ済み:', matchedProducts.length);
    console.log('未マッチ:', unmatchedProducts.length);

    return NextResponse.json({
      success: true,
      data: rakutenData,
      matchedProducts,
      unmatchedProducts
    });

  } catch (error) {
    console.error('楽天CSV解析エラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    });
  }
}
