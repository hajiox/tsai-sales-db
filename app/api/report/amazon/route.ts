// /app/api/import/amazon/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/server'; // Supabaseクライアントのインポート

// CSVパース関数 (簡易版 - Amazon固定フォーマット向け)
function parseAmazonCsv(csvContent: string): any[] {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  // ヘッダー行をスキップし、データ行のみを処理
  const dataLines = lines.slice(1); 
  const parsedData: any[] = [];

  dataLines.forEach(line => {
    // AmazonのCSVはカンマ区切りで、項目によってはダブルクォートで囲まれています。
    // ここでは簡易的に、一般的なCSVパースロジックを想定します。
    // 必要に応じて、より堅牢なCSVパーサーライブラリ（例: 'csv-parse/sync'）の導入を検討してください。
    const columns = line.match(/(?:[^,"無]+|"(?:[^"]|"")*")+/g); // ダブルクォート対応の簡易正規表現
    
    if (!columns || columns.length < 20) { // 最低限必要なカラム数を確認 (例として20を設定)
      console.warn('スキップされた行 (カラム不足または不正):', line);
      return;
    }

    try {
      // AmazonのCSVフォーマットに合わせて、必要な列のインデックスを指定します。
      // 例: 商品名, SKU, 数量, 販売日 など
      // アップロードされた画像から推測されるヘッダーを元にインデックスを設定しますが、
      // 実際のCSVファイルのヘッダーと正確に一致させる必要があります。

      // 仮のインデックス (実際のAmazon CSVの構造に合わせて調整してください)
      // 例: "注文日", "商品名", "SKU", "数量", "販売価格" など
      // 画像から「注文日」「商品名」「数量」などを特定し、それらに対応するインデックスを使用します。
      // ここでは仮に以下のように設定します。正確なインデックスはCSVを直接確認して設定してください。
      // - 注文日: columns[0] (例: 2025/03/01)
      // - 商品名: columns[1] (例: 商品A)
      // - SKU: columns[2] (例: ABCD-EFGH)
      // - 数量: columns[3] (例: 1)
      // - 販売価格: columns[4] (例: 1000)

      // CSVファイル '2025.03Amazon売上.csv' の内容に基づいてインデックスを調整します。
      // 仮に以下のように対応させます（これはあくまで仮であり、実際のCSVで確認が必要です）
      // 「販売日」, 「商品名」, 「数量」, 「売上」のインデックスを特定
      const orderDate = columns[0].trim(); // 注文日
      const productName = columns[4].trim(); // 商品名 (例: "商品名" が5列目にある場合)
      const quantity = parseInt(columns[8].trim(), 10); // 数量 (例: "数量" が9列目にある場合)
      const salesAmount = parseInt(columns[12].trim().replace(/¥|,/g, ''), 10); // 売上金額 (例: "商品合計" が13列目にある場合)

      if (isNaN(quantity) || isNaN(salesAmount)) {
        console.warn('数値変換失敗。スキップされた行:', line);
        return;
      }

      parsedData.push({
        order_date: orderDate,
        product_name: productName,
        quantity: quantity,
        sales_amount: salesAmount,
        // その他必要なデータがあれば追加
      });

    } catch (e) {
      console.error('CSV行のパース中にエラーが発生しました:', e, '行データ:', line);
    }
  });

  return parsedData;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'ファイルがアップロードされていません' }, { status: 400 });
    }

    // ファイルの内容をテキストとして読み込む
    const arrayBuffer = await file.arrayBuffer();
    const decoder = new TextDecoder('utf-8'); // 通常はUTF-8でOKだが、Shift_JISの場合は適宜変更
    const csvContent = decoder.decode(arrayBuffer);

    // CSVデータをパース
    const parsedData = parseAmazonCsv(csvContent);
    
    if (parsedData.length === 0) {
      return NextResponse.json({ message: 'パースされたデータがありません' }, { status: 200 });
    }

    // Supabaseへのデータ登録処理
    // ここではweb_sales_summaryテーブルへの挿入を想定していますが、
    // Amazonデータの特性に合わせて適切なテーブルとスキーマを設計してください。
    // 例: amazon_sales_data のような専用テーブル
    const { data, error } = await supabase
      .from('web_sales_summary') // 適切なテーブル名に変更してください
      .upsert(parsedData.map(item => ({
        // データベースのカラム名に合わせてマッピング
        // これらはweb_sales_summaryテーブルの既存の構造に合わせる必要があります
        // 仮のデータマッピング:
        product_id: null, // productsテーブルとの連携が必要な場合は後で更新
        report_month: `${item.order_date.substring(0, 7)}-01`, // 'YYYY/MM/DD' -> 'YYYY-MM-01'
        amazon_count: item.quantity,
        amazon_amount: item.sales_amount,
        // 他のECサイトのカウント/金額は0またはnull
        rakuten_count: 0,
        yahoo_count: 0,
        mercari_count: 0,
        base_count: 0,
        qoo10_count: 0,
        rakuten_amount: 0,
        yahoo_amount: 0,
        mercari_amount: 0,
        base_amount: 0,
        qoo10_amount: 0,
      })), { 
        onConflict: 'report_month, product_id' // 競合時の動作 (複合ユニーク制約)
      });

    if (error) {
      console.error('Supabaseへのデータ登録エラー:', error);
      return NextResponse.json({ error: 'データの保存に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Amazon売上データが正常にインポートされました', data }, { status: 200 });

  } catch (error: any) {
    console.error('AmazonインポートAPIエラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー', details: error.message }, { status: 500 });
  }
}
