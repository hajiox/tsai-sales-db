// /app/api/import/csv/route.ts ver.2 (CSV解析機能を追加)

import { NextResponse } from 'next/server';
import Papa from 'papaparse';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'ファイルがありません。' }, { status: 400 });
    }

    // ファイルの中身をテキストとして読み込む
    const csvString = await file.text();

    // PapaParseでCSV文字列を解析
    const parsedData = Papa.parse(csvString, {
      header: true, // 1行目をヘッダーとして扱い、オブジェクトのキーにする
      skipEmptyLines: true, // 空行は無視する
    });

    if (parsedData.errors.length > 0) {
      console.error('CSV解析エラー:', parsedData.errors);
      return NextResponse.json({ error: 'CSVの解析に失敗しました。' }, { status: 400 });
    }

    const dataRows = parsedData.data;
    console.log('CSV解析結果:', dataRows);

    // ★ 今後のステップ: ここで dataRows を使ってDBへの保存処理を行う

    return NextResponse.json({
      message: `CSVを解析しました。${dataRows.length}行のデータが見つかりました。`,
      fileName: file.name,
      rowCount: dataRows.length,
    }, { status: 200 });

  } catch (error) {
    console.error('APIエラー:', error);
    return NextResponse.json({ error: 'ファイルの処理中にエラーが発生しました。' }, { status: 500 });
  }
}
