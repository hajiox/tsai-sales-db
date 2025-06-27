// /app/api/import/rakuten-parse/route.ts ver.5 - JSONエラー修正版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 類似度計算関数（キーワードベース）
function calculateSimilarity(text1: string, text2: string): number {
  const normalize = (text: string) => text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  
  const normalized1 = normalize(text1);
  const normalized2 = normalize(text2);
  
  const words1 = normalized1.split(' ').filter(word => word.length > 1);
  const words2 = normalized2.split(' ').filter(word => word.length > 1);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  let matchingWords = 0;
  words1.forEach(word1 => {
    if (words2.some(word2 => word2.includes(word1) || word1.includes(word2))) {
      matchingWords++;
    }
  });
  
  return matchingWords / Math.max(words1.length, words2.length);
}

export async function POST(request: NextRequest) {
  try {
    const { csvContent } = await request.json();

    if (!csvContent) {
      return NextResponse.json({ 
        success: false, 
        error: 'CSVコンテンツが提供されていません' 
      });
    }

    // CSVを行に分割（8行目からデータ開始）
    const lines = csvContent.split('\n');
    const dataLines = lines.slice(7).filter(line => line.trim() !== '');

    // 楽天CSVデータをパース
    const rakutenData = dataLines.map((line, index) => {
      const columns = line.split(',');
      const productName = columns[0]?.replace(/"/g, '').trim();
      const quantity = parseInt(columns[4]?.replace(/"/g, '').trim() || '0');

      return {
        rowIndex: index + 8,
        rakutenTitle: productName,
        quantity: quantity
      };
    }).filter(item => item.rakutenTitle && item.quantity > 0);

    // 商品マスターデータを取得（Amazon方式と同じ）
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*');

    if (productsError) {
      console.error('商品データ取得エラー:', productsError);
      return NextResponse.json({ 
        success: false, 
        error: `商品データ取得エラー: ${productsError.message}` 
      });
    }

    console.log('商品マスター件数:', products?.length || 0);

    // 学習済みマッピングを取得
    const { data: learnedMappings } = await supabase
      .from('rakuten_product_mapping')
      .select('rakuten_title, product_id');

    const learnedMap = new Map(
      learnedMappings?.map(m => [m.rakuten_title, m.product_id]) || []
    );

    // 各楽天商品をマッチング
    const matchedProducts = [];
    const unmatchedProducts = [];

    for (const rakutenItem of rakutenData) {
      const { rakutenTitle, quantity } = rakutenItem;

      // まず学習済みデータでマッチングを試行
      if (learnedMap.has(rakutenTitle)) {
        const productId = learnedMap.get(rakutenTitle);
        const productInfo = products?.find(p => p.id === productId);
        
        if (productInfo) {
          matchedProducts.push({
            rakutenTitle,
            quantity,
            productId,
            productInfo,
            matchType: 'learned'
          });
          continue;
        }
      }

      // 学習済みデータがない場合、類似度計算でマッチング
      // 楽天商品名の前半40文字のみ使用（SEOキーワード除去）
      const rakutenCore = rakutenTitle.substring(0, 40).trim();
      
      let bestMatch = null;
      let bestScore = 0;

      for (const product of products || []) {
        const score = calculateSimilarity(rakutenCore, product.name);
        
        // 40%閾値でマッチング
        if (score > bestScore && score > 0.4) {
          bestMatch = {
            productId: product.id,
            productInfo: product,
            score
          };
          bestScore = score;
        }
      }

      if (bestMatch) {
        matchedProducts.push({
          rakutenTitle,
          quantity,
          productId: bestMatch.productId,
          productInfo: bestMatch.productInfo,
          matchType: 'similarity',
          score: bestMatch.score
        });
      } else {
        unmatchedProducts.push({
          rakutenTitle,
          quantity
        });
      }
    }

    // 合計数量の計算
    const totalQuantity = rakutenData.reduce((sum, item) => sum + item.quantity, 0);
    const processableQuantity = matchedProducts.reduce((sum, item) => sum + item.quantity, 0);

    return NextResponse.json({
      success: true,
      totalProducts: rakutenData.length,
      totalQuantity,
      processableQuantity,
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
