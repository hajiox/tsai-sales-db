// /app/api/import/rakuten-parse/route.ts ver.9 - CSVクォート対応版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * CSVの1行をパースする関数。引用符（"）で囲まれたフィールド内のカンマを正しく処理します。
 * @param line - CSVの1行の文字列
 * @returns 列の配列
 */
function parseCsvLine(line: string): string[] {
  const columns = [];
  let currentColumn = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // 連続する2つの引用符は、1つの引用符として扱う
      if (inQuotes && line[i + 1] === '"') {
        currentColumn += '"';
        i++; // 次の引用符をスキップ
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      columns.push(currentColumn.trim());
      currentColumn = '';
    } else {
      currentColumn += char;
    }
  }
  columns.push(currentColumn.trim());
  return columns;
}

export async function POST(request: NextRequest) {
  try {
    const { csvContent } = await request.json();

    if (!csvContent) {
      return NextResponse.json({
        success: false,
        error: 'CSVコンテンツが提供されていません',
      });
    }

    // CSVを行に分割（8行目からデータ開始）
    const lines = csvContent.split('\n');
    const dataLines = lines.slice(7).filter((line) => line.trim() !== '');

    console.log('楽天CSV解析開始 - v9');

    // 楽天CSVデータをパース
    const rakutenData = dataLines
      .map((line, index) => {
        // 新しいCSV解析関数を使用
        const columns = parseCsvLine(line);

        // 列数が不十分な場合はスキップ
        if (columns.length < 5) {
          console.warn(`⚠️ 行${index + 8}は列数が不十分なためスキップします: ${line}`);
          return null;
        }

        const productName = columns[0]?.replace(/"/g, '').trim();
        const quantityStr = columns[4]?.replace(/"/g, '').trim();
        const quantity = parseInt(quantityStr || '0', 10);
        
        if (productName?.includes('会津ソースカツ丼のソース')) {
          console.log(`✅ 会津ソースカツ丼のソース検出:`);
          console.log(`  商品名: ${productName}`);
          console.log(`  E列の値: "${columns[4]}"`);
          console.log(`  パース後の数量: ${quantity}`);
        }

        return {
          rowIndex: index + 8,
          rakutenTitle: productName,
          quantity: quantity,
        };
      })
      .filter((item) => item && item.rakutenTitle && item.quantity > 0);

    console.log('楽天CSV解析完了');
    console.log('楽天商品数:', rakutenData.length);
    const totalQuantity = rakutenData.reduce((sum, item) => sum + (item?.quantity || 0), 0);
    console.log('総数量:', totalQuantity);

    // 商品マスターデータを取得
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*');

    if (productsError) {
      throw new Error(`商品データ取得エラー: ${productsError.message}`);
    }

    // 学習済みマッピングを取得
    const { data: learnedMappings } = await supabase
      .from('rakuten_product_mapping')
      .select('rakuten_title, product_id');

    const learningData =
      learnedMappings?.map((m) => ({
        amazon_title: m.rakuten_title,
        product_id: m.product_id,
      })) || [];

    // 各楽天商品をマッチング
    const matchedProducts = [];
    const unmatchedProducts = [];

    for (const rakutenItem of rakutenData) {
      if (!rakutenItem) continue;
      const { rakutenTitle, quantity } = rakutenItem;

      const matchedProduct = findBestMatchSimplified(
        rakutenTitle,
        products || [],
        learningData
      );

      if (matchedProduct) {
        matchedProducts.push({
          rakutenTitle,
          quantity,
          productId: matchedProduct.id,
          productInfo: matchedProduct,
          matchType: matchedProduct.matchType || 'medium',
          score: matchedProduct.score || 0,
        });
      } else {
        unmatchedProducts.push({
          rakutenTitle,
          quantity,
        });
      }
    }

    const processableQuantity = matchedProducts.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    
    return NextResponse.json({
      success: true,
      totalProducts: rakutenData.length,
      totalQuantity,
      processableQuantity,
      matchedProducts,
      unmatchedProducts,
    });
  } catch (error) {
    console.error('楽天CSV解析エラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
    });
  }
}
