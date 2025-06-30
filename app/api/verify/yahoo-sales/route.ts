// /app/api/verify/yahoo-sales/route.ts ver.8
// CSVパースの問題を特定するための簡易版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isValidString(value: any): value is string {
  return value && typeof value === 'string' && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const csvFile = formData.get('csvFile') as File;
    const targetMonth = formData.get('targetMonth') as string;

    if (!csvFile || !targetMonth) {
      return NextResponse.json({ success: false, error: 'CSVファイルと対象月が必要です' }, { status: 400 });
    }

    const buffer = await csvFile.arrayBuffer();
    let csvData;
    try {
      csvData = new TextDecoder('utf-8').decode(buffer, { fatal: true });
    } catch (error) {
      csvData = new TextDecoder('shift-jis').decode(buffer);
    }
    
    // デバッグ: CSVの最初の3行を確認
    const allLines = csvData.split('\n');
    const debugInfo = {
      totalLines: allLines.length,
      firstThreeLines: allLines.slice(0, 3).map((line, i) => {
        const cols = line.split(',');
        return {
          lineNo: i,
          columnCount: cols.length,
          first50chars: line.substring(0, 50),
          col0: cols[0],
          col5: cols[5]
        };
      })
    };

    // エラーレスポンスとしてデバッグ情報を返す（一時的）
    return NextResponse.json({ 
      success: false, 
      error: 'デバッグ中',
      debugInfo 
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : '検証処理でエラーが発生しました' 
    }, { status: 500 });
  }
}
