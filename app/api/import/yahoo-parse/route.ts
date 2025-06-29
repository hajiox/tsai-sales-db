// /app/api/import/yahoo-parse/route.ts ver.1
// Yahoo CSV解析API（楽天パターンベース・CSV形式対応）

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

// Supabase直接初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    console.log('=== Yahoo CSV解析API開始 ===');
    
    const { csvData } = await request.json();
    
    if (!csvData) {
      return NextResponse.json({ 
        success: false, 
        error: 'CSVデータが必要です' 
      }, { status: 400 });
    }

    // 文字化けチェック（情報出力のみ）
    console.log('受信したCSVデータの最初の100文字:', csvData.substring(0, 100));
    
    const hasGarbledText = /[\x00-\x08\x0E-\x1F\x7F-\x9F]/.test(csvData) || 
                          csvData.includes('�') || 
                          csvData.includes('繧�') ||
                          csvData.includes('繝�');

    if (hasGarbledText) {
      console.warn('CSV文字化けを検出しましたが、処理を継続します');
    }

    // 1. CSVを行に分割（Yahoo：1行目ヘッダー）
    const lines = csvData.split('\n').filter(line => line.trim());
    console.log(`CSVファイル: ${lines.length}行（ヘッダー含む）`);
    
    if (lines.length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'データが不足しています' 
      }, { status: 400 });
    }

    // 2. ヘッダーをスキップしてデータ行を処理
    const dataLines = lines.slice(1);
    console.log(`データ行数: ${dataLines.length}行`);

    // 3. 商品データと学習データを並行取得
    console.log('商品マスタと学習データを取得中...');
    const [productsResponse, learnedMappingsResponse] = await Promise.all([
      supabase.from('products').select('id, name'),
      supabase.from('yahoo_product_mapping').select('yahoo_title, product_id')
    ]);

    console.log('商品マスタ取得レスポンス:', {
      data: productsResponse.data ? `${productsResponse.data.length}件` : 'null',
      error: productsResponse.error
    });
    
    console.log('学習データ取得レスポンス:', {
      data: learnedMappingsResponse.data ? `${learnedMappingsResponse.data.length}件` : 'null', 
      error: learnedMappingsResponse.error
    });

    if (productsResponse.error) {
      console.error('商品データ取得エラー:', productsResponse.error);
      throw new Error('商品データの取得に失敗しました');
    }

    if (learnedMappingsResponse.error) {
      console.error('学習データ取得エラー:', learnedMappingsResponse.error);
      throw new Error('学習データの取得に失敗しました');
    }

    const products = productsResponse.data || [];
    const learnedMappings = learnedMappingsResponse.data || [];
    
    // 4. 学習データをcsvHelpers期待形式に変換（yahoo_title → amazon_title）
    const learningData = learnedMappings.map(m => ({ 
      amazon_title: m.yahoo_title,  // 統一フィールド名に変換
      product_id: m.product_id 
    }));

    console.log(`商品マスタ: ${products.length}件, 学習データ: ${learningData.length}件`);
    
    // デバッグ: 商品マスタと学習データの詳細
    console.log(`商品マスタ取得結果: ${products.length}件`);
    if (products.length > 0) {
      console.log('商品マスタの最初の1件の全プロパティ:');
      console.log(JSON.stringify(products[0], null, 2));
      
      console.log('商品マスタサンプル（最初の5件）:');
      products.slice(0, 5).forEach((p, idx) => {
        console.log(`  ${idx + 1}: ${JSON.stringify(p)}`);
      });
      
      // プロパティ名の確認
      const firstProduct = products[0];
      console.log('商品マスタの利用可能プロパティ:', Object.keys(firstProduct));
    } else {
      console.error('⚠️ 商品マスタが空です！');
    }
    
    if (learningData.length > 0) {
      console.log('学習データサンプル（最初の3件）:');
      learningData.slice(0, 3).forEach((l, idx) => {
        console.log(`  ${idx + 1}: amazon_title="${l.amazon_title}", product_id="${l.product_id}"`);
      });
    } else {
      console.log('学習データは空です（初回実行のため正常）');
    }
    
    // 元の学習データも確認
    if (learnedMappings.length > 0) {
      console.log('元の学習データサンプル（最初の3件）:');
      learnedMappings.slice(0, 3).forEach((m, idx) => {
        console.log(`  ${idx + 1}: yahoo_title="${m.yahoo_title}", product_id="${m.product_id}"`);
      });
    }

    // 5. CSV行を解析してマッチング
    const matchedProducts = [];
    const blankTitleProducts = [];
    
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      try {
        // CSVパース（カンマ区切り）
        const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
        
        if (columns.length < 6) {
          console.log(`行${i + 2}: 列数不足の行をスキップ: ${columns.length}列`);
          continue;
        }

        // Yahoo仕様: A列=商品名(0), F列=数量(5)
        const productTitle = columns[0];
        const quantityStr = columns[5];
        const quantity = parseInt(quantityStr) || 0;

        console.log(`行${i + 2}: 商品名="${productTitle}", 数量="${quantityStr}" -> ${quantity}`);

        if (quantity <= 0) {
          console.log(`行${i + 2}: 数量0の商品をスキップ: ${productTitle}`);
          continue;
        }

        // 商品名空欄チェック
        if (!productTitle || productTitle.trim() === '') {
          blankTitleProducts.push({
            productTitle: '（空欄）',
            quantity,
            rawLine: line
          });
          console.log(`行${i + 2}: 空欄商品名: 数量=${quantity}`);
          continue;
        }

        // 商品マッチング実行
        console.log(`\n=== 行${i + 2}: マッチング詳細開始 ===`);
        console.log(`入力商品名: "${productTitle}"`);
        console.log(`商品マスタ件数: ${products.length}件`);
        console.log(`学習データ件数: ${learningData.length}件`);
        
        // 最初の行でのみ詳細サンプル表示
        if (i === 0) {
          console.log('\n【商品マスタサンプル】:');
          products.slice(0, 5).forEach((p, idx) => {
            console.log(`  ${idx + 1}: id="${p.id}", name="${p.name}"`);
          });
          
          if (learningData.length > 0) {
            console.log('\n【学習データサンプル】:');
            learningData.slice(0, 3).forEach((l, idx) => {
              console.log(`  ${idx + 1}: amazon_title="${l.amazon_title}", product_id="${l.product_id}"`);
            });
          }
        }
        
        // findBestMatchSimplified関数を呼び出し
        console.log(`\nfindBestMatchSimplified実行開始...`);
        const matchResult = findBestMatchSimplified(productTitle, products, learningData);
        console.log(`findBestMatchSimplified実行完了`);
        
        if (!matchResult) {
          console.error(`❌ マッチング関数がnullを返しました: "${productTitle}"`);
          throw new Error('マッチング処理でエラーが発生しました');
        }
        
        console.log(`\n【マッチング結果】:`);
        console.log(`  - 入力: "${productTitle}"`);
        console.log(`  - スコア: ${matchResult.score}`);
        console.log(`  - マッチした商品: ${matchResult.product?.name || 'なし'}`);
        console.log(`  - マッチした商品ID: ${matchResult.product?.id || 'なし'}`);
        console.log(`  - 学習データ利用: ${matchResult.isLearned ? 'はい' : 'いいえ'}`);
        console.log(`=== 行${i + 2}: マッチング詳細終了 ===\n`);
        
        // Amazon/楽天と同じ閾値でチェック（通常0.3以上でマッチとみなす）
        if (matchResult.score >= 0.3) {
          console.log(`✅ スコア${matchResult.score}で商品マッチ成功`);
        } else {
          console.log(`⚠️ スコア${matchResult.score}で商品マッチ失敗（閾値0.3未満）`);
        }
        
        matchedProducts.push({
          productTitle,
          quantity,
          score: matchResult.score || 0,
          productInfo: matchResult.product || null,
          isLearned: matchResult.isLearned || false,
          rawLine: line
        });

      } catch (lineError) {
        console.error(`行${i + 2}の処理エラー:`, lineError);
        console.error(`問題の行: "${line}"`);
        // エラーが発生した行はスキップして処理を続行
        continue;
      }
    }

    // 6. 結果サマリー作成
    try {
      const matchedCount = matchedProducts.filter(p => p.productInfo).length;
      const unmatchedCount = matchedProducts.filter(p => !p.productInfo).length;
      const learnedCount = matchedProducts.filter(p => p.isLearned).length;

      const summary = {
        totalProducts: matchedProducts.length,
        matchedProducts: matchedCount,
        unmatchedProducts: unmatchedCount, 
        learnedMatches: learnedCount,
        blankTitleInfo: {
          count: blankTitleProducts.length,
          totalQuantity: blankTitleProducts.reduce((sum, p) => sum + (p.quantity || 0), 0)
        }
      };

      console.log('=== Yahoo CSV解析完了 ===');
      console.log('サマリー:', summary);

      // 7. 統一レスポンス構造（summaryオブジェクト必須）
      return NextResponse.json({
        success: true,
        summary,
        matchedProducts,
        blankTitleProducts,
        csvRowCount: dataLines.length
      });
      
    } catch (summaryError) {
      console.error('サマリー作成エラー:', summaryError);
      throw new Error('結果サマリーの作成に失敗しました');
    }

  } catch (error) {
    console.error('Yahoo CSV解析エラー:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : '不明なエラーが発生しました' 
    }, { status: 500 });
  }
}
