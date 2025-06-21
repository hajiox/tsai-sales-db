// /app/api/import/amazon/route.ts ver.2
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { matchProduct, normalizeProductName } from '@/lib/db/productMatcher'; // matchProductとnormalizeProductNameをインポート
import Papa from 'papaparse'; // CSVパースにPapaParseを使用

// Amazon CSVの列インデックス定数 (0-indexed)
const AMAZON_PRODUCT_NAME_COL = 2; // C列はインデックス2
const AMAZON_QUANTITY_COL = 13;    // N列はインデックス13

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'ファイルがアップロードされていません' }, { status: 400 });
    }

    // ファイルの内容をテキストとして読み込む
    const arrayBuffer = await file.arrayBuffer();
    // Amazon CSVのエンコーディングは通常UTF-8ですが、念のためShift_JISも試せるようにPapaParseに任せます
    const csvContent = new TextDecoder('utf-8').decode(arrayBuffer); // 一旦UTF-8でデコードを試みる

    // PapaParseを使ってCSVをパース
    const parseResult = Papa.parse(csvContent, {
      header: false, // ヘッダーは手動でスキップするためfalse
      skipEmptyLines: true,
      // PapaParseはエンコーディング自動判別が弱いため、明示的にUTF-8を指定。
      // もし文字化けする場合は、ここでエンコーディングオプションを調整する必要があるかもしれません。
      encoding: 'utf-8', 
      error: (error) => {
        console.error('PapaParseエラー:', error);
      }
    });

    const parsedRows = parseResult.data as string[][];

    // ヘッダー行と、データが不正な行をスキップ
    // AmazonのCSVは、注文データ以外の情報も含まれる場合があるため、
    // 実際にデータが始まる行から処理を開始し、各行のカラム数をチェックすることが重要です。
    // 今回はN列（インデックス13）までデータがあると想定し、少なくとも14カラム以上ある行を有効とします。
    const dataRows = parsedRows.filter((row, index) => {
      // 最初の数行はヘッダーや要約の場合があるため、データ開始行を特定するロジックが必要
      // Amazonの典型的な売上レポートは、最初の数行がサマリーで、その後に詳細データが続くことが多いです。
      // 仮にデータ行は最低でも指定した列数を持つと仮定します。
      return row.length > Math.max(AMAZON_PRODUCT_NAME_COL, AMAZON_QUANTITY_COL);
    });

    if (dataRows.length === 0) {
      return NextResponse.json({ message: 'パースされた有効なデータがありません' }, { status: 200 });
    }

    // Supabaseから全ての商品マスタデータを取得
    const { data: allProducts, error: productsError } = await supabase
      .from('products')
      .select('id, name, series, series_code, product_number, global_product_id');

    if (productsError) {
      console.error('商品マスタ取得エラー:', productsError);
      return NextResponse.json({ error: '商品マスタの取得に失敗しました' }, { status: 500 });
    }
    if (!allProducts || allProducts.length === 0) {
      return NextResponse.json({ error: '商品マスタがありません。先に商品マスタを登録してください。' }, { status: 400 });
    }

    const upsertData: any[] = [];
    const processedProductCounts = new Map<string, { total_quantity: number; total_amount: number }>();

    dataRows.forEach((row, rowIndex) => {
      const productName = row[AMAZON_PRODUCT_NAME_COL]?.trim();
      const quantityStr = row[AMAZON_QUANTITY_COL]?.trim();
      
      if (!productName || !quantityStr) {
        console.warn(`スキップされた行 ${rowIndex + 1}: 商品名または数量が不正です。`, row);
        return;
      }

      const quantity = parseInt(quantityStr, 10);

      if (isNaN(quantity) || quantity <= 0) { // 数量が有効な数値で、かつ0より大きいことを確認
        console.warn(`スキップされた行 ${rowIndex + 1}: 数量が不正です (${quantityStr})。`, row);
        return;
      }
      
      // 商品マスタとのマッチング
      const matchedProduct = matchProduct(productName, allProducts);

      if (!matchedProduct) {
        console.warn(`マッチング失敗: Amazon商品名 "${productName}" に対応する商品が見つかりませんでした。行 ${rowIndex + 1}`);
        return;
      }

      // 月ごとの集計のために、report_monthを特定する必要があります。
      // Amazon CSVには「注文日」のような日付カラムがあるはずですが、今回は「商品名」と「数量」のみに限定されているため、
      // どの月のデータとして扱うかを決定する必要があります。
      // 現状は、CSVファイル名から月を特定するか、手動で指定する想定で進めます。
      // 今回は `2025.03Amazon売上.csv` のファイル名から「2025-03」と仮定します。
      // 本番運用では日付カラムから動的に取得するロジックが必要です。
      const reportMonth = '2025-03-01'; // ここを動的に取得するロジックを追加する必要あり

      const key = `${reportMonth}-${matchedProduct.id}`;
      if (!processedProductCounts.has(key)) {
        processedProductCounts.set(key, { total_quantity: 0, total_amount: 0 });
      }
      const entry = processedProductCounts.get(key)!;
      entry.total_quantity += quantity;
      // AmazonのCSVには商品ごとの単価がないため、金額は0としています。
      // 必要であればproductsテーブルのpriceを利用するか、別途金額データを取得するロジックが必要です。
      entry.total_amount += (quantity * (matchedProduct.price || 0)); // productMatcherから価格が取得できれば計算

    });

    // 集計したデータをupsertDataに追加
    processedProductCounts.forEach((value, key) => {
      const [reportMonth, productId] = key.split('-');
      upsertData.push({
        product_id: productId,
        report_month: reportMonth,
        amazon_count: value.total_quantity,
        amazon_amount: value.total_amount,
        // 他のECサイトのカウント/金額は0または既存の値を維持するため、
        // onConflictで既存レコードを更新する際は注意が必要です。
        // 今回はamazon_countとamazon_amountのみを更新するようにします。
        // NOTE: web_sales_summaryテーブルにupsertする場合、他のECサイトの数値が上書きされる可能性があります。
        // その場合は、既存データを読み込んでから更新値を設定するロジックが必要になります。
        // 現状はAmazonデータで直接更新することを想定します。
      });
    });

    if (upsertData.length === 0) {
      return NextResponse.json({ message: '登録対象のデータがありませんでした。' }, { status: 200 });
    }

    // Supabaseへのデータ登録処理
    // onConflictでreport_monthとproduct_idが競合した場合に更新
    const { data, error } = await supabase
      .from('web_sales_summary')
      .upsert(upsertData, { 
        onConflict: 'report_month, product_id', 
        ignoreDuplicates: false // 重複時は更新する
      });

    if (error) {
      console.error('Supabaseへのデータ登録エラー:', error);
      return NextResponse.json({ error: 'データの保存に失敗しました', details: error.message }, { status: 500 });
    }

    console.log('Amazon売上データ upsert 成功:', { upsertedRows: data?.length });
    return NextResponse.json({ message: 'Amazon売上データが正常にインポートされました', data }, { status: 200 });

  } catch (error: any) {
    console.error('AmazonインポートAPIエラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー', details: error.message }, { status: 500 });
  }
}
