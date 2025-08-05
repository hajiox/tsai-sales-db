// /app/api/general-ledger/import/route.ts ver.9
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 日付パーサー
function parseJapaneseDate(dateStr: string, baseYear: number = 2025): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  
  const trimmed = dateStr.trim();
  if (trimmed === '') return '';
  
  // "7. 2. 1" 形式
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    const month = parts[1].trim().padStart(2, '0');
    const day = parts[2].trim().padStart(2, '0');
    const year = parts[0].trim() === '7' ? baseYear : parseInt(parts[0]) + 2018;
    return `${year}-${month}-${day}`;
  }
  
  return '';
}

// 数値パーサー
function parseNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,、]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

// 勘定科目名からコードを生成する関数
function generateAccountCode(accountName: string, sheetIndex: number): string {
  // シンプルなハッシュ関数で名前からコードを生成
  let hash = 0;
  for (let i = 0; i < accountName.length; i++) {
    const char = accountName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // 正の数にして、6桁のコードを生成
  const code = Math.abs(hash) % 1000000;
  return code.toString().padStart(6, '0');
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

    // ファイルをArrayBufferとして読み込む
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // XLSXでワークブックを読み込む
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    const allTransactions = [];
    const accountsMap = new Map<string, any>(); // 重複を防ぐためMapを使用
    const monthlyBalances = [];
    let processedSheets = 0;
    const errors = [];
    let globalRowNumber = 1;
    
    // 各シートを処理
    workbook.SheetNames.forEach((sheetName, sheetIndex) => {
      try {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];
        
        if (!jsonData || jsonData.length < 5) {
          return;
        }
        
        // 勘定科目情報を抽出
        let accountCode = '';
        let accountName = '';
        
        // 3行目から勘定科目コードを探す
        for (let col = 0; col < 5; col++) {
          if (jsonData[2] && jsonData[2][col]) {
            const cellValue = String(jsonData[2][col]).trim();
            if (/^[\d\-]+$/.test(cellValue) && cellValue.length >= 4) {
              accountCode = cellValue;
              break;
            }
          }
        }
        
        // コードが見つからない場合または07003の場合は生成
        if (!accountCode || accountCode === '07003') {
          accountCode = `SHEET${(sheetIndex + 1).toString().padStart(3, '0')}`;
        }
        
        // 2行目に科目名
        if (jsonData[1]) {
          const nameParts = [];
          for (let i = 2; i < Math.min(6, jsonData[1].length); i++) {
            if (jsonData[1][i] && String(jsonData[1][i]).trim() && 
                !String(jsonData[1][i]).includes('ﾍﾟｰｼﾞ')) {
              nameParts.push(String(jsonData[1][i]).trim());
            }
          }
          accountName = nameParts.join('') || `勘定科目${sheetIndex + 1}`;
        }
        
        if (!accountName) return;
        
        // 勘定科目名からコード生成（07003対策）
        if (accountCode === '07003' || accountCode.startsWith('SHEET')) {
          accountCode = generateAccountCode(accountName, sheetIndex);
        }
        
        console.log(`処理中: ${accountName} (コード: ${accountCode})`);
        
        // ヘッダー行を探す
        let headerRow = -1;
        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
          if (jsonData[i] && jsonData[i][0] && 
              String(jsonData[i][0]).includes('日') && 
              String(jsonData[i][0]).includes('付')) {
            headerRow = i;
            break;
          }
        }
        
        if (headerRow === -1) {
          return;
        }
        
        // 勘定科目マスタに追加（重複チェック）
        if (!accountsMap.has(accountCode)) {
          accountsMap.set(accountCode, {
            account_code: accountCode,
            account_name: accountName,
            account_type: '未分類',
            is_active: true
          });
        }
        
        // 取引データを抽出
        let openingBalance = 0;
        let totalDebit = 0;
        let totalCredit = 0;
        let closingBalance = 0;
        let transactionCount = 0;
        
        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || !row[0]) continue;
          
          const dateStr = String(row[0]).trim();
          if (!dateStr || dateStr === ' ') continue;
          
          // 前月繰越行の処理
          if (row[1] && String(row[1]).includes('前月繰越')) {
            openingBalance = parseNumber(row[7]);
            continue;
          }
          
          // 日付をパース
          const transactionDate = parseJapaneseDate(dateStr);
          if (!transactionDate) continue;
          
          // 金額列の位置
          // F列（インデックス5）: 借方金額
          // G列（インデックス6）: 貸方金額
          // H列（インデックス7）: 残高
          const debitAmount = parseNumber(row[5]);
          const creditAmount = parseNumber(row[6]);
          const balance = parseNumber(row[7]);
          
          allTransactions.push({
            report_month: reportMonth,
            account_code: accountCode,
            transaction_date: transactionDate,
            counter_account: row[1] ? String(row[1]).trim() : null,
            description: row[2] ? String(row[2]).trim() : null,
            debit_amount: debitAmount,
            credit_amount: creditAmount,
            balance: balance,
            sheet_no: sheetIndex + 1,
            row_no: globalRowNumber++
          });
          
          totalDebit += debitAmount;
          totalCredit += creditAmount;
          
          if (balance !== null) {
            closingBalance = balance;
          }
          
          transactionCount++;
        }
        
        // 月次残高を記録
        if (transactionCount > 0) {
          const existingBalance = monthlyBalances.find(
            b => b.account_code === accountCode && b.report_month === reportMonth
          );
          
          if (existingBalance) {
            // 既存の残高に加算
            existingBalance.total_debit += totalDebit;
            existingBalance.total_credit += totalCredit;
            existingBalance.closing_balance = closingBalance;
            existingBalance.transaction_count += transactionCount;
          } else {
            // 新規追加
            monthlyBalances.push({
              account_code: accountCode,
              report_month: reportMonth,
              opening_balance: openingBalance,
              total_debit: totalDebit,
              total_credit: totalCredit,
              closing_balance: closingBalance,
              transaction_count: transactionCount
            });
          }
        }
        
        processedSheets++;
      } catch (sheetError) {
        console.error(`シート${sheetIndex + 1}の処理エラー:`, sheetError);
        errors.push(`シート${sheetIndex + 1}: ${sheetError instanceof Error ? sheetError.message : 'エラー'}`);
      }
    });

    // MapからArrayに変換
    const accountsToUpsert = Array.from(accountsMap.values());

    console.log(`処理完了: ${processedSheets}シート, ${allTransactions.length}件の取引, ${accountsToUpsert.length}件の勘定科目`);

    // データベースに保存
    try {
      // 1. 最初に勘定科目マスタを更新
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

      // 2. 既存の取引データを削除
      const { error: deleteError } = await supabase
        .from('general_ledger')
        .delete()
        .eq('report_month', reportMonth);
        
      if (deleteError) {
        console.error('既存データ削除エラー:', deleteError);
      }

      // 3. 新規取引データを挿入
      if (allTransactions.length > 0) {
        // バッチ処理（500件ずつ）
        for (let i = 0; i < allTransactions.length; i += 500) {
          const batch = allTransactions.slice(i, i + 500);
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
      if (monthlyBalances.length > 0) {
        const { error: balanceError } = await supabase
          .from('monthly_account_balance')
          .upsert(monthlyBalances, {
            onConflict: 'account_code,report_month'
          });
          
        if (balanceError) {
          console.error('月次残高更新エラー:', balanceError);
          errors.push(`月次残高更新エラー: ${balanceError.message}`);
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
      message: `${processedSheets}シートを処理しました`,
      details: {
        processedSheets,
        totalTransactions: allTransactions.length,
        accounts: accountsToUpsert.length,
        errors: errors.length > 0 ? errors : undefined
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
