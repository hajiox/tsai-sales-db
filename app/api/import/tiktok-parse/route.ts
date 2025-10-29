// app/api/import/tiktok-parse/route.ts ver.2 (カンマ区切り対応)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { csvText } = await request.json();

    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json({ error: 'CSVテキストが必要です' }, { status: 400 });
    }

    // CSVをカンマ区切りで解析（BOM除去）
    const cleanedText = csvText.replace(/^\uFEFF/, ''); // BOM除去
    const lines = cleanedText.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSVデータが空です' }, { status: 400 });
    }

    const header = lines[0].split(',');
    console.log('[TikTok Parse] ヘッダー列数:', header.length);
    console.log('[TikTok Parse] ヘッダー（最初の10列）:', header.slice(0, 10));

    // 必要な列のインデックスを取得
    const productNameIndex = 7; // 商品名（8列目、0始まりなので7）
    const quantityIndex = 9; // 数量（10列目）
    const orderAmountIndex = 21; // 注文金額（22列目）
    const paymentDateIndex = 24; // 注文の支払い日時（25列目）

    // Supabaseクライアント作成
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 学習データを取得
    const { data: learningData, error: learningError } = await supabase
      .from('tiktok_product_mapping')
      .select('tiktok_product_name, product_id');

    if (learningError) {
      console.error('[TikTok Parse] 学習データ取得エラー:', learningError);
    }

    const learningMap = new Map<string, string>();
    if (learningData) {
      learningData.forEach(item => {
        learningMap.set(item.tiktok_product_name, item.product_id);
      });
    }

    console.log(`[TikTok Parse] 学習データ件数: ${learningMap.size}`);

    // 商品ごとに集計
    const productMap = new Map<string, { count: number; saleDate: string }>();

    for (let i = 1; i < lines.length; i++) {
      // CSVの値を正しく分割（ダブルクォートで囲まれた値に対応）
      const columns = parseCSVLine(lines[i]);
      
      if (columns.length < 25) {
        console.log(`[TikTok Parse] 行${i + 1}: 列数不足 (${columns.length}列)`);
        continue;
      }

      const productName = columns[productNameIndex]?.trim();
      const quantityStr = columns[quantityIndex]?.trim();
      const orderAmount = columns[orderAmountIndex]?.trim();
      const paymentDate = columns[paymentDateIndex]?.trim();

      // 商品名が空の場合はスキップ
      if (!productName) {
        console.log(`[TikTok Parse] 行${i + 1}: 商品名が空`);
        continue;
      }

      // 注文金額が0円または空の場合はスキップ（無料サンプル）
      if (!orderAmount || orderAmount === '0 JPY' || orderAmount === '' || orderAmount === '0') {
        console.log(`[TikTok Parse] 行${i + 1}: 無料サンプルのためスキップ (${productName})`);
        continue;
      }

      const quantity = parseInt(quantityStr) || 0;

      if (quantity <= 0) {
        console.log(`[TikTok Parse] 行${i + 1}: 数量が0以下 (${productName})`);
        continue;
      }

      // 日付をYYYY-MM形式に変換
      let formattedDate = '';
      if (paymentDate) {
        // MM/DD/YYYY HH:MM:SS AM/PM 形式を解析
        const dateMatch = paymentDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dateMatch) {
          const month = dateMatch[1].padStart(2, '0');
          const day = dateMatch[2].padStart(2, '0');
          const year = dateMatch[3];
          formattedDate = `${year}-${month}`;
        }
      }

      // 既存データがある場合は加算、ない場合は新規追加
      if (productMap.has(productName)) {
        const existing = productMap.get(productName)!;
        existing.count += quantity;
      } else {
        productMap.set(productName, {
          count: quantity,
          saleDate: formattedDate
        });
      }
    }

    console.log(`[TikTok Parse] 集計結果: ${productMap.size}商品`);

    // 結果を配列に変換
    const results = Array.from(productMap.entries()).map(([title, data]) => {
      const learnedProductId = learningMap.get(title);
      
      return {
        title,
        count: data.count,
        saleDate: data.saleDate,
        productId: learnedProductId || null,
        isLearned: !!learnedProductId
      };
    });

    // 学習済みと未学習で分類
    const learned = results.filter(r => r.isLearned);
    const unlearned = results.filter(r => !r.isLearned);

    console.log(`[TikTok Parse] 学習済み: ${learned.length}件, 未学習: ${unlearned.length}件`);

    return NextResponse.json({
      success: true,
      results: {
        learned,
        unlearned
      },
      summary: {
        total: results.length,
        learned: learned.length,
        unlearned: unlearned.length
      }
    });

  } catch (error) {
    console.error('[TikTok Parse] エラー:', error);
    return NextResponse.json({ 
      error: 'CSVの解析中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// CSV行をパースする関数（ダブルクォートで囲まれた値に対応）
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // エスケープされたダブルクォート
        current += '"';
        i++;
      } else {
        // クォートの開始/終了
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // カンマ区切り（クォート外）
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}
