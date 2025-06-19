// /app/api/import/csv/route.ts (新規作成)

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // フロントエンドから送られてくるフォームデータを取得
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    // ファイルが存在しない場合はエラーを返す
    if (!file) {
      return NextResponse.json({ error: 'ファイルがありません。' }, { status: 400 });
    }

    // Vercelのコンソールログに受信したファイル情報を出力
    console.log('API側でファイルを受信しました:', file.name, file.size, 'bytes');

    // ★ 今後のステップ: ここでCSVの解析やDBへの保存処理を行う

    // 成功したことをフロントエンドに伝える
    return NextResponse.json({
      message: 'ファイルを受信しました。',
      fileName: file.name,
      fileSize: file.size,
    }, { status: 200 });

  } catch (error) {
    console.error('APIエラー:', error);
    return NextResponse.json({ error: 'ファイルの処理中にエラーが発生しました。' }, { status: 500 });
  }
}
