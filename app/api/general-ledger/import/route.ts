// /app/api/general-ledger/import/route.ts ver.22 - CSVヘッダー確認版
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const reportMonth = formData.get('reportMonth') as string;

    if (!file || !reportMonth) {
      return NextResponse.json(
        { error: '必要な情報が不足しています' },
        { status: 400 }
      );
    }

    // CSVファイルチェック
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { error: 'CSVファイルを選択してください' },
        { status: 400 }
      );
    }

    // CSVファイルを読み込む
    const text = await file.text();
    const lines = text.split('\n');
    
    // 最初の5行を確認
    console.log('=== CSV構造確認 ===');
    console.log('総行数:', lines.length);
    
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      console.log(`行${i + 1}:`, lines[i].substring(0, 200)); // 最初の200文字まで
    }
    
    // ヘッダー行を詳細に分析
    if (lines.length > 0) {
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      console.log('ヘッダー数:', headers.length);
      console.log('ヘッダー詳細:', headers);
      
      // 重複チェック
      const headerCounts: { [key: string]: number } = {};
      const duplicates: string[] = [];
      
      for (const header of headers) {
        if (headerCounts[header]) {
          if (!duplicates.includes(header)) {
            duplicates.push(header);
          }
          headerCounts[header]++;
        } else {
          headerCounts[header] = 1;
        }
      }
      
      if (duplicates.length > 0) {
        console.log('重複ヘッダー:', duplicates);
        duplicates.forEach(dup => {
          console.log(`  "${dup}": ${headerCounts[dup]}回`);
        });
      }
    }
    
    // とりあえず成功レスポンスを返す
    return NextResponse.json({
      success: true,
      message: 'CSV構造確認完了（ログを確認してください）',
      details: {
        totalTransactions: 0,
        accounts: 0,
        processedSheets: 1,
        format: 'CSV'
      }
    });

  } catch (error) {
    console.error('エラー:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'エラーが発生しました' },
      { status: 500 }
    );
  }
}
