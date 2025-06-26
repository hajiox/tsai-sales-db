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
  // 楽天タイトルの前半40文字のみを取得
  const rakutenCore = rakutenTitle.substring(0, 40).trim();
  
  // テキストを正規化
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .replace(/<br>/g, ' ')
      .replace(/[【】（）()「」]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const rakutenNormalized = normalizeText(rakutenCore);
  const productNormalized = normalizeText(productName);

  // 商品名のキーワードを抽出（2文字以上）
  const productKeywords = productNormalized.split(' ').filter(word => word.length > 1);
  
  if (productKeywords.length === 0) return 0;

  // 各キーワードが楽天タイトル（前半40文字）に含まれているかチェック
  let matchCount = 0;
  for (const keyword of productKeywords) {
    if (rakutenNormalized.includes(keyword)) {
      matchCount++;
    }
  }

  // マッチ率を計算（0-1の範囲）
  return matchCount / productKeywords.length;
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

    for (const item of rakutenData) {
      const productId = mappingMap.get(item.productName);
      
      if (productId && productMap.has(productId)) {
        // 既存の学習データでマッチング
        matchedProducts.push({
          rakutenTitle: item.productName,
          productId: productId,
          productInfo: productMap.get(productId),
          quantity: item.quantity,
          originalRow: item.originalRow
        });
      } else {
        // 学習データがない場合、商品名の部分マッチングを試行
        let bestMatch = null;
        let bestScore = 0;

        for (const [id, product] of productMap) {
          const score = calculateSimilarity(item.productName, product.name);
          if (score > bestScore && score > 0.3) { // 30%以上の類似度
            bestScore = score;
            bestMatch = { productId: id, productInfo: product };
          }
        }

        if (bestMatch) {
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
          unmatchedProducts.push({
            rakutenTitle: item.productName,
            quantity: item.quantity,
            originalRow: item.originalRow
          });
        }
      }
    }

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
