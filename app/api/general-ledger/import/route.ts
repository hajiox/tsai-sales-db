// /app/api/general-ledger/import/route.ts ver.27
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Shift-JISからUTF-8への変換
async function convertShiftJisToUtf8(buffer: ArrayBuffer): Promise<string> {
  try {
    // TextDecoderを使用してShift-JISをデコード
    const decoder = new TextDecoder('shift-jis');
    return decoder.decode(buffer);
  } catch (error) {
    console.log('Shift-JIS変換エラー、UTF-8として処理:', error);
    // Shift-JIS変換に失敗した場合はUTF-8として処理
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  }
}

// CSVパース関数（重複ヘッダー対応）
function parseCSV(csvText: string): any[] {
  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) return [];

  // ヘッダー行の処理（重複がある場合は番号を付ける）
  const headerLine = lines[0];
  const rawHeaders = headerLine.split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''));
  
  const headers: string[] = [];
  const headerCounts: { [key: string]: number } = {};
  
  for (const header of rawHeaders) {
    if (headerCounts[header]) {
      headerCounts[header]++;
      headers.push(`${header}_${headerCounts[header]}`);
    } else {
      headerCounts[header] = 1;
      headers.push(header);
    }
  }

  console.log('処理後のヘッダー:', headers);
  console.log('重複ヘッダー:', Object.entries(headerCounts).filter(([_, count]) => count > 1));

  const data: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim().replace(/^"/, '').replace(/"$/, ''));
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    data.push(row);
  }

  return data;
}

// 日付文字列をDate型に変換
function parseDate(year: string, month: string, day: string): string {
  const y = parseInt(year);
  const m = parseInt(month);
  const d = parseInt(day);
  
  if (isNaN(y) || isNaN(m) || isNaN(d)) {
    return '';
  }
  
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 金額をパース（カンマを除去して数値に変換）
function parseAmount(value: string): number {
  if (!value || value === '') return 0;
  const cleaned = value.replace(/,/g, '').replace(/"/g, '');
  const parsed = parseInt(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const reportMonth = formData.get('reportMonth') as string;

    if (!file || !reportMonth) {
      return NextResponse.json(
        { error: 'ファイルと対象月は必須です' },
        { status: 400 }
      );
    }

    console.log('処理開始:', {
      fileName: file.name,
      fileSize: file.size,
      reportMonth: reportMonth
    });

    // ファイルをArrayBufferとして読み込み
    const buffer = await file.arrayBuffer();
    
    // Shift-JISからUTF-8に変換（.txtファイルの場合）
    let csvContent: string;
    if (file.name.endsWith('.txt')) {
      console.log('TXTファイル検出: Shift-JIS変換を実行');
      csvContent = await convertShiftJisToUtf8(buffer);
    } else {
      // CSVファイルの場合はUTF-8として処理
      const decoder = new TextDecoder('utf-8');
      csvContent = decoder.decode(buffer);
    }

    // CSVパース
    const data = parseCSV(csvContent);
    console.log(`CSVパース完了: ${data.length}行`);

    if (data.length === 0) {
      return NextResponse.json(
        { error: 'CSVファイルにデータがありません' },
        { status: 400 }
      );
    }

    // 最初の10レコードの内容を確認
    console.log('最初の10レコード:', data.slice(0, 10));

    // 勘定科目マスタのデータを準備
    const accountMasterMap = new Map<string, any>();
    
    // 総勘定元帳データを準備（ブロック構造対応）
    const generalLedgerData: any[] = [];
    let rowNumber = 1;
    let currentAccountCode = '';
    let currentAccountName = '';
    let skippedCount = 0;
    let processedCount = 0;

    for (const row of data) {
      // タイトル行のスキップ
      if (row['タイトル'] === '総勘定元帳') {
        skippedCount++;
        continue;
      }

      // 新しい勘定科目ブロックの開始を検出
      if (row['元帳主科目コード'] && row['主科目名']) {
        currentAccountCode = row['元帳主科目コード'];
        currentAccountName = row['主科目名'];
        
        console.log(`勘定科目ブロック開始: ${currentAccountCode} - ${currentAccountName}`);
        
        // 勘定科目マスタに追加
        if (!accountMasterMap.has(currentAccountCode)) {
          accountMasterMap.set(currentAccountCode, {
            account_code: currentAccountCode,
            account_name: currentAccountName,
            account_type: '未分類',
            is_active: true
          });
        }
      }

      // 特殊行のスキップ
      const description = row['摘要'] || '';
      if (description.includes('※前月繰越')) {
        skippedCount++;
        continue;
      }
      if (description.includes('月度計') || description.includes('次月繰越') || description.includes('※')) {
        skippedCount++;
        continue;
      }

      // 日付データがない行はスキップ
      if (!row['取引年'] || !row['取引月'] || !row['取引日']) {
        skippedCount++;
        continue;
      }

      // 取引データの作成
      const transactionDate = parseDate(row['取引年'], row['取引月'], row['取引日']);
      if (!transactionDate || !currentAccountCode) {
        skippedCount++;
        continue;
      }

      const ledgerEntry = {
        report_month: `${reportMonth}-01`,
        account_code: currentAccountCode,
        transaction_date: transactionDate,
        counter_account: row['主科目名_2'] || '',
        department: '',
        description: description,
        debit_amount: parseAmount(row['借方金額']),
        credit_amount: parseAmount(row['貸方金額']),
        balance: parseAmount(row['残高']),
        sheet_no: 1,
        row_no: rowNumber++
      };

      generalLedgerData.push(ledgerEntry);
      processedCount++;
    }

    console.log('データ処理完了:', {
      勘定科目数: accountMasterMap.size,
      取引件数: generalLedgerData.length,
      スキップ件数: skippedCount,
      処理件数: processedCount
    });

    // 勘定科目マスタの更新
    if (accountMasterMap.size > 0) {
      const accountMasterData = Array.from(accountMasterMap.values());
      const { error: masterError } = await supabase
        .from('account_master')
        .upsert(accountMasterData, { onConflict: 'account_code' });

      if (masterError) {
        console.error('勘定科目マスタ更新エラー:', masterError);
        throw masterError;
      }
      console.log(`勘定科目マスタ更新完了: ${accountMasterData.length}件`);
    }

    // 既存データの削除
    const { error: deleteError } = await supabase
      .from('general_ledger')
      .delete()
      .eq('report_month', `${reportMonth}-01`);

    if (deleteError) {
      console.error('既存データ削除エラー:', deleteError);
      throw deleteError;
    }

    // 総勘定元帳データの挿入（バッチ処理）
    if (generalLedgerData.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < generalLedgerData.length; i += batchSize) {
        const batch = generalLedgerData.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('general_ledger')
          .insert(batch);

        if (insertError) {
          console.error(`バッチ${Math.floor(i/batchSize) + 1}挿入エラー:`, insertError);
          throw insertError;
        }
        console.log(`バッチ${Math.floor(i/batchSize) + 1}挿入完了: ${batch.length}件`);
      }
    }

    // 月次残高の更新
    const { data: balanceData, error: balanceError } = await supabase.rpc(
      'update_monthly_account_balance',
      { target_month: `${reportMonth}-01` }
    );

    if (balanceError) {
      console.error('月次残高更新エラー:', balanceError);
      // エラーがあってもインポート自体は成功とする
    }

    return NextResponse.json({
      success: true,
      message: 'インポートが完了しました',
      stats: {
        accountCount: accountMasterMap.size,
        transactionCount: generalLedgerData.length,
        skippedCount: skippedCount
      }
    });

  } catch (error) {
    console.error('インポートエラー:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'インポートに失敗しました' },
      { status: 500 }
    );
  }
}
