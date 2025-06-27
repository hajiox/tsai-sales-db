// /app/api/import/rakuten-parse/route.ts ver.7 - Amazon方式高精度マッチング

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    console.log('楽天CSV解析開始 - Amazon方式適用');
    console.log('楽天商品数:', rakutenData.length);

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

    // 学習済みマッピングを取得（Amazon方式と同じ）
    const { data: learnedMappings } = await supabase
      .from('rakuten_product_mapping')
      .select('rakuten_title, product_id');

    console.log('楽天学習データ件数:', learnedMappings?.length || 0);

    // 学習データを適切な形式に変換（Amazon形式に合わせる）
    const learningData = learnedMappings?.map(m => ({
      amazon_title: m.rakuten_title, // findBestMatchSimplifiedはamazon_titleを期待
      product_id: m.product_id
    })) || [];

    // 各楽天商品をAmazon方式でマッチング
    const matchedProducts = [];
    const unmatchedProducts = [];

    for (const rakutenItem of rakutenData) {
      const { rakutenTitle, quantity } = rakutenItem;

      console.log(`\n=== 楽天商品マッチング処理 ===`);
      console.log('楽天商品:', rakutenTitle);

      // Amazon方式の高精度マッチングを適用
      const matchedProduct = findBestMatchSimplified(rakutenTitle, products || [], learningData);

      if (matchedProduct) {
        matchedProducts.push({
          rakutenTitle,
          quantity,
          productId: matchedProduct.id,
          productInfo: matchedProduct,
          matchType: matchedProduct.matchType || 'medium',
          score: matchedProduct.score || 0
        });
        console.log(`マッチング成功: ${rakutenTitle} → ${matchedProduct.name} (${matchedProduct.matchType})`);
      } else {
        unmatchedProducts.push({
          rakutenTitle,
          quantity
        });
        console.log(`マッチング失敗: ${rakutenTitle}`);
      }
    }

    // 合計数量の計算
    const totalQuantity = rakutenData.reduce((sum, item) => sum + item.quantity, 0);
    const processableQuantity = matchedProducts.reduce((sum, item) => sum + item.quantity, 0);

    console.log('\n=== 楽天マッチング結果 ===');
    console.log('総商品数:', rakutenData.length);
    console.log('マッチ成功:', matchedProducts.length);
    console.log('未マッチ:', unmatchedProducts.length);
    console.log('マッチ率:', ((matchedProducts.length / rakutenData.length) * 100).toFixed(1) + '%');
    console.log('処理可能数量:', processableQuantity, '/', totalQuantity);

    // マッチング詳細ログ
    console.log('\n=== マッチング詳細 ===');
    matchedProducts.forEach(item => {
      console.log(`✅ ${item.rakutenTitle} → ${item.productInfo.name} (${item.matchType})`);
    });

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
