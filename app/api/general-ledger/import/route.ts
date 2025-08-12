// /app/api/general-ledger/import/route.ts ver.28
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 独自のCSVパーサー（重複ヘッダー対応版）
function parseCSV(text: string) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  
  // ヘッダー行を取得
  const headerLine = lines[0];
  const headers = [];
  const headerCounts = new Map();
  
  // ヘッダーを分割（カンマ区切り、ダブルクォート考慮）
  const rawHeaders = headerLine.match(/("([^"]*)"|[^,]+)/g) || [];
  
  // 重複するヘッダーに番号を付ける
  for (const rawHeader of rawHeaders) {
    const header = rawHeader.replace(/^"|"$/g, '').trim();
    const count = headerCounts.get(header) || 0;
    headerCounts.set(header, count + 1);
    
    if (count > 0) {
      headers.push(`${header}_${count + 1}`);
    } else {
      headers.push(header);
    }
  }
  
  // データ行を処理
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = line.match(/("([^"]*)"|[^,]+)/g) || [];
    const row: any = {};
    
    for (let j = 0; j < headers.length; j++) {
      const value = values[j] ? values[j].replace(/^"|"$/g, '').trim() : '';
      row[headers[j]] = value;
    }
    
    rows.push(row);
  }
  
  return { headers, rows };
}

// 日付のパース関数
const parseDate = (dateStr: any) => {
  if (!dateStr || dateStr.trim() === '') {
    return null;
  }
  
  const dateString = dateStr.toString().trim();
  
  // 令和対応
  const reiwaMatch = dateString.match(/令和(\d+)年(\d{1,2})月(\d{1,2})日/);
  if (reiwaMatch) {
    const year = 2018 + parseInt(reiwaMatch[1]);
    const month = reiwaMatch[2].padStart(2, '0');
    const day = reiwaMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // 既存のパターン
  const patterns = [
    /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    /(\d{2})\/(\d{1,2})\/(\d{1,2})/  // YY/MM/DD形式
  ];
  
  for (const pattern of patterns) {
    const match = dateString.match(pattern);
    if (match) {
      let year = match[1];
      // 2桁年の場合の処理
      if (year.length === 2) {
        year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
      }
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      
      // 日付の妥当性チェック
      const dateObj = new Date(`${year}-${month}-${day}`);
      if (isNaN(dateObj.getTime())) {
        console.error(`無効な日付: ${year}-${month}-${day}`);
        return null;
      }
      
      return `${year}-${month}-${day}`;
    }
  }
  
  console.error(`日付パース失敗: "${dateString}"`);
  return null;
};

// 金額のパース関数
const parseAmount = (amountStr: any) => {
  if (!amountStr) return 0;
  const cleaned = amountStr.toString().replace(/[,，]/g, '').trim();
  const amount = parseInt(cleaned);
  return isNaN(amount) ? 0 : amount;
};

// 月次残高の更新関数
async function updateMonthlyBalance(reportMonth: string) {
  try {
    const { data, error } = await supabase.rpc('update_monthly_balance', {
      target_month: reportMonth
    });
    
    if (error) {
      console.error('月次残高更新エラー:', error);
      return false;
    }
    
    console.log('月次残高を更新しました');
    return true;
  } catch (error) {
    console.error('月次残高更新で例外発生:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const reportMonth = formData.get('reportMonth') as string;
    
    if (!file || !reportMonth) {
      return NextResponse.json({ error: 'ファイルと対象月は必須です' }, { status: 400 });
    }
    
    console.log('処理開始:', {
      fileName: file.name,
      fileSize: file.size,
      reportMonth: reportMonth
    });
    
    // ファイル読み込みと文字コード変換
    let text: string;
    const fileExtension = file.name.toLowerCase().split('.').pop();
    
    if (fileExtension === 'txt') {
      console.log('TXTファイル検出: Shift-JIS変換を実行');
      const arrayBuffer = await file.arrayBuffer();
      const decoder = new TextDecoder('shift-jis');
      text = decoder.decode(arrayBuffer);
    } else {
      text = await file.text();
    }
    
    // CSVパース
    const { headers, rows } = parseCSV(text);
    console.log('処理前のヘッダー:', headers);
    console.log('データ行数:', rows.length);
    
    // 勘定科目を収集（ブロック構造対応）
    const accountMap = new Map();
    let currentAccountCode = '';
    let currentAccountName = '';
    
    // 勘定科目の収集とブロック構造の解析
    for (const row of rows) {
      if (row['勘定科目コード'] && row['勘定科目コード'].trim() !== '') {
        currentAccountCode = row['勘定科目コード'].trim();
        currentAccountName = row['主科目名']?.trim() || '';
        
        if (currentAccountCode && currentAccountName && !accountMap.has(currentAccountCode)) {
          accountMap.set(currentAccountCode, currentAccountName);
          console.log(`新しい勘定科目ブロック開始: ${currentAccountCode} - ${currentAccountName}`);
        }
      }
    }
    
    console.log(`勘定科目数: ${accountMap.size}`);
    
    // 勘定科目マスタの更新
    const accountEntries = Array.from(accountMap.entries());
    for (const [code, name] of accountEntries) {
      const { error: accountError } = await supabase
        .from('account_master')
        .upsert({
          account_code: code,
          account_name: name,
          account_type: '未分類',
          is_active: true
        }, {
          onConflict: 'account_code'
        });
      
      if (accountError) {
        console.error('勘定科目登録エラー:', accountError);
      }
    }
    
    // 既存データの削除
    const { error: deleteError } = await supabase
      .from('general_ledger')
      .delete()
      .eq('report_month', reportMonth);
    
    if (deleteError) {
      console.error('既存データ削除エラー:', deleteError);
      return NextResponse.json({ error: '既存データの削除に失敗しました' }, { status: 500 });
    }
    
    // 総勘定元帳データの処理
    const records = [];
    currentAccountCode = '';
    currentAccountName = '';
    let skippedCount = 0;
    let processedCount = 0;
    let rowNumber = 1;
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // 勘定科目コードの更新（ブロック構造対応）
      if (row['勘定科目コード'] && row['勘定科目コード'].trim() !== '') {
        currentAccountCode = row['勘定科目コード'].trim();
        currentAccountName = row['主科目名']?.trim() || '';
        console.log(`勘定科目切り替え（行${i + 1}）: ${currentAccountCode} - ${currentAccountName}`);
      }
      
      // スキップ条件
      if (!currentAccountCode) {
        skippedCount++;
        continue;
      }
      
      if (row['タイトル'] === '総勘定元帳') {
        skippedCount++;
        continue;
      }
      
      if (!row['伝票日付'] || row['伝票日付'].trim() === '') {
        skippedCount++;
        continue;
      }
      
      // 月度計、次月繰越をスキップ
      const description = row['摘要科目コード_2'] || row['摘要'] || '';
      if (description.includes('月度計') || description.includes('次月繰越')) {
        skippedCount++;
        continue;
      }
      
      // 前月繰越以外の※行をスキップ
      if (description.includes('※') && !description.includes('前月繰越')) {
        skippedCount++;
        continue;
      }
      
      const transactionDate = parseDate(row['伝票日付']);
      
      if (!transactionDate) {
        skippedCount++;
        continue;
      }
      
      // レコードの作成
      const record = {
        report_month: reportMonth,
        account_code: currentAccountCode,
        transaction_date: transactionDate,
        counter_account: row['主科目名_2'] || '',
        department: row['部門名'] || '',
        description: description,
        debit_amount: parseAmount(row['借方金額']),
        credit_amount: parseAmount(row['貸方金額']),
        balance: parseAmount(row['残高']),
        sheet_no: 1,
        row_no: rowNumber++
      };
      
      records.push(record);
      processedCount++;
      
      // デバッグ用：最初の3件のレコードを表示
      if (processedCount <= 3) {
        console.log(`レコード${processedCount}:`, {
          account: `${record.account_code} - ${currentAccountName}`,
          date: record.transaction_date,
          description: record.description,
          debit: record.debit_amount,
          credit: record.credit_amount
        });
      }
    }
    
    console.log(`処理完了: 処理済み${processedCount}件, スキップ${skippedCount}件`);
    
    // バッチ挿入
    const batchSize = 500;
    let insertedCount = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('general_ledger')
        .insert(batch);
      
      if (insertError) {
        console.error('データ挿入エラー:', insertError);
        console.error('エラー発生バッチの最初のレコード:', batch[0]);
        return NextResponse.json({ 
          error: 'データの登録に失敗しました',
          details: insertError.message
        }, { status: 500 });
      }
      
      insertedCount += batch.length;
      console.log(`挿入完了: ${insertedCount}/${records.length}`);
    }
    
    // 月次残高の更新
    const balanceUpdated = await updateMonthlyBalance(reportMonth);
    if (!balanceUpdated) {
      console.warn('月次残高の更新に失敗しましたが、インポートは成功しました');
    }
    
    return NextResponse.json({
      success: true,
      message: `${processedCount}件の取引データを登録しました`,
      details: {
        processed: processedCount,
        skipped: skippedCount,
        accounts: accountMap.size
      }
    });
    
  } catch (error) {
    console.error('インポートエラー:', error);
    return NextResponse.json({
      error: 'インポート処理中にエラーが発生しました',
      details: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}
