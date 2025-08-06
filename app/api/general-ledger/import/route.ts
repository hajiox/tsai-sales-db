// /app/api/general-ledger/import/route.ts ver.23 - デバッグ強化版
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// CSVパース関数（重複ヘッダー対応）
function parseCSVWithDuplicateHeaders(text: string): any[] {
  const lines = text.split('\n');
  if (lines.length === 0) return [];
  
  // ヘッダー行を取得（重複する場合は番号を付ける）
  const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
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
  
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // カンマ区切りで分割（クォート内のカンマは考慮）
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''));
    
    // オブジェクトに変換
    const record: any = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });
    records.push(record);
  }
  
  return records;
}

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

    // ファイル名で処理を分岐
    const fileName = file.name.toLowerCase();
    const isCSV = fileName.endsWith('.csv');

    if (!isCSV) {
      return NextResponse.json(
        { error: 'CSVファイルを選択してください' },
        { status: 400 }
      );
    }

    // CSVファイルを読み込む
    const text = await file.text();
    
    // 重複ヘッダー対応のCSVパース
    const records = parseCSVWithDuplicateHeaders(text);

    console.log(`CSVレコード数: ${records.length}`);
    
    // 最初の5レコードを確認（データ構造の確認用）
    for (let i = 0; i < Math.min(5, records.length); i++) {
      console.log(`レコード${i + 1}:`, {
        タイトル: records[i]['タイトル'],
        取引日: records[i]['取引日'],
        元帳主科目コード: records[i]['元帳主科目コード'],
        主科目名: records[i]['主科目名'],
        摘要: records[i]['摘要'],
        借方金額: records[i]['借方金額'],
        貸方金額: records[i]['貸方金額'],
        残高: records[i]['残高']
      });
    }

    const accountsMap = new Map<string, any>();
    const transactions = [];
    const monthlyBalances = new Map<string, any>();
    let rowNumber = 1;
    let processedCount = 0;
    let skippedCount = 0;

    // 各レコードを処理
    for (const record of records) {
      // タイトル行はスキップ
      if (record['タイトル'] === '総勘定元帳') {
        skippedCount++;
        continue;
      }

      // 取引日がない場合はスキップ
      if (!record['取引日'] || record['取引日'] === '') {
        skippedCount++;
        continue;
      }

      // 空行や不要な行をスキップ
      const description = record['摘要'] || '';
      if (description.includes('※') ||
          description.includes('前月繰越') || 
          description.includes('月度計') ||
          description.includes('次月繰越')) {
        
        // 前月繰越の場合は残高を記録
        if (description.includes('前月繰越')) {
          const accountCode = record['元帳主科目コード'];
          const balanceStr = (record['残高'] || '0').toString().replace(/,/g, '');
          const balance = parseInt(balanceStr) || 0;
          if (accountCode && balance) {
            const balanceKey = `${accountCode}-${reportMonth}`;
            if (!monthlyBalances.has(balanceKey)) {
              monthlyBalances.set(balanceKey, {
                account_code: accountCode,
                report_month: reportMonth,
                opening_balance: balance,
                total_debit: 0,
                total_credit: 0,
                closing_balance: 0,
                transaction_count: 0
              });
            } else {
              monthlyBalances.get(balanceKey).opening_balance = balance;
            }
          }
        }
        skippedCount++;
        continue;
      }

      const accountCode = record['元帳主科目コード'];
      const accountName = record['主科目名'];
      
      // 勘定科目コードがない場合はスキップ
      if (!accountCode || accountCode === '') {
        skippedCount++;
        continue;
      }

      // 勘定科目マスタに追加
      if (!accountsMap.has(accountCode)) {
        accountsMap.set(accountCode, {
          account_code: accountCode,
          account_name: accountName || `勘定科目${accountCode}`,
          account_type: '未分類',
          is_active: true
        });
        console.log(`勘定科目追加: ${accountCode} - ${accountName}`);
      }

      // 日付を作成
      const year = record['取引年'] || '2025';  // デフォルト値
      const month = String(record['取引月'] || '2').padStart(2, '0');  // デフォルト値
      const day = String(record['取引日']).padStart(2, '0');
      const transactionDate = `${year}-${month}-${day}`;

      // 金額を数値に変換（カンマを除去）
      const debitStr = (record['借方金額'] || '0').toString().replace(/,/g, '');
      const creditStr = (record['貸方金額'] || '0').toString().replace(/,/g, '');
      const balanceStr = (record['残高'] || '0').toString().replace(/,/g, '');
      
      const debitAmount = parseInt(debitStr) || 0;
      const creditAmount = parseInt(creditStr) || 0;
      const balance = parseInt(balanceStr) || 0;

      // 取引データを作成
      transactions.push({
        report_month: reportMonth,
        account_code: accountCode,
        transaction_date: transactionDate,
        counter_account: record['相手主科目コード'] || record['摘要科目名'] || null,
        description: description,
        debit_amount: debitAmount,
        credit_amount: creditAmount,
        balance: balance,
        sheet_no: 1,
        row_no: rowNumber++
      });

      // 月次残高を更新
      const balanceKey = `${accountCode}-${reportMonth}`;
      if (!monthlyBalances.has(balanceKey)) {
        monthlyBalances.set(balanceKey, {
          account_code: accountCode,
          report_month: reportMonth,
          opening_balance: 0,
          total_debit: 0,
          total_credit: 0,
          closing_balance: 0,
          transaction_count: 0
        });
      }
      
      const monthlyBalance = monthlyBalances.get(balanceKey);
      monthlyBalance.total_debit += debitAmount;
      monthlyBalance.total_credit += creditAmount;
      monthlyBalance.closing_balance = balance;
      monthlyBalance.transaction_count++;
      
      processedCount++;
      
      // 最初の取引をログ出力
      if (processedCount === 1) {
        console.log('最初の取引:', {
          accountCode: accountCode,
          accountName: accountName,
          date: transactionDate,
          description: description,
          debit: debitAmount,
          credit: creditAmount,
          balance: balance
        });
      }
    }

    const accountsToUpsert = Array.from(accountsMap.values());
    const monthlyBalancesToUpsert = Array.from(monthlyBalances.values());

    console.log(`処理完了: ${transactions.length}件の取引, ${accountsToUpsert.length}件の勘定科目, ${skippedCount}件スキップ`);

    // データベースに保存
    try {
      // 1. 勘定科目マスタを更新
      if (accountsToUpsert.length > 0) {
        const { error: accountError } = await supabase
          .from('account_master')
          .upsert(accountsToUpsert, { 
            onConflict: 'account_code',
            ignoreDuplicates: false 
          });
          
        if (accountError) {
          console.error('勘定科目マスタ更新エラー:', accountError);
          throw accountError;
        }
      }

      // 2. 既存データを削除
      const { error: deleteError } = await supabase
        .from('general_ledger')
        .delete()
        .eq('report_month', reportMonth);
        
      if (deleteError) {
        console.error('既存データ削除エラー:', deleteError);
      }

      // 3. 新規データを挿入（バッチ処理）
      if (transactions.length > 0) {
        for (let i = 0; i < transactions.length; i += 500) {
          const batch = transactions.slice(i, i + 500);
          const { error: insertError } = await supabase
            .from('general_ledger')
            .insert(batch);
            
          if (insertError) {
            console.error('取引データ挿入エラー:', insertError);
            throw insertError;
          }
        }
      }

      // 4. 月次残高を更新
      if (monthlyBalancesToUpsert.length > 0) {
        const { error: balanceError } = await supabase
          .from('monthly_account_balance')
          .upsert(monthlyBalancesToUpsert, {
            onConflict: 'account_code,report_month'
          });
          
        if (balanceError) {
          console.error('月次残高更新エラー:', balanceError);
          throw balanceError;
        }
      }

    } catch (dbError: any) {
      console.error('データベース処理エラー:', dbError);
      return NextResponse.json(
        { error: `データベース処理エラー: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `CSVインポートが完了しました`,
      details: {
        totalTransactions: transactions.length,
        accounts: accountsToUpsert.length,
        processedSheets: 1,
        format: 'CSV'
      }
    });

  } catch (error) {
    console.error('インポートエラー:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'インポート処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
