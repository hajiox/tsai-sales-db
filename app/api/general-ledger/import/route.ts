// /app/api/general-ledger/import/route.ts ver.1
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 日付パーサー（"7. 2. 1" → "2025-02-01"）
function parseJapaneseDate(dateStr: string, baseYear: number = 2025): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  
  const parts = dateStr.trim().split('.');
  if (parts.length < 3) return '';
  
  const month = parts[1].trim().padStart(2, '0');
  const day = parts[2].trim().padStart(2, '0');
  
  // 令和7年 = 2025年
  const year = parts[0].trim() === '7' ? baseYear : parseInt(parts[0]) + 2018;
  
  return `${year}-${month}-${day}`;
}

// 勘定科目情報の抽出
function extractAccountInfo(sheet: any[][]): { code: string; name: string } {
  let code = '';
  let name = '';
  
  // 3行目にコードがある
  if (sheet[2] && sheet[2][0]) {
    code = String(sheet[2][0]).trim();
  }
  
  // 2行目に科目名が分割されている
  if (sheet[1]) {
    const nameParts = [];
    for (let i = 2; i < Math.min(6, sheet[1].length); i++) {
      if (sheet[1][i] && String(sheet[1][i]).trim() && 
          !String(sheet[1][i]).includes('ﾍﾟｰｼﾞ')) {
        nameParts.push(String(sheet[1][i]).trim());
      }
    }
    name = nameParts.join('');
  }
  
  return { code, name };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const reportMonth = formData.get('reportMonth') as string;

    if (!file || !reportMonth) {
      return NextResponse.json(
        { error: 'ファイルと対象月を指定してください' },
        { status: 400 }
      );
    }

    // Excelファイルを読み込む
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    const allTransactions = [];
    const accountsToUpsert = [];
    const monthlyBalances = [];
    let processedSheets = 0;
    let errors = [];

    // 各シートを処理
    for (const sheetName of workbook.SheetNames) {
      try {
        const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { 
          header: 1, 
          defval: null 
        });
        
        if (!sheet || sheet.length < 10) continue;
        
        // 勘定科目情報を抽出
        const accountInfo = extractAccountInfo(sheet);
        if (!accountInfo.code || !accountInfo.name) continue;
        
        // 勘定科目マスタに追加
        accountsToUpsert.push({
          account_code: accountInfo.code,
          account_name: accountInfo.name,
          account_type: '未分類', // 後で分類
          is_active: true
        });
        
        // ヘッダー行を探す（"日付"を含む行）
        let headerRow = -1;
        for (let i = 0; i < Math.min(10, sheet.length); i++) {
          if (sheet[i] && sheet[i][0] && 
              String(sheet[i][0]).includes('日') && 
              String(sheet[i][0]).includes('付')) {
            headerRow = i;
            break;
          }
        }
        
        if (headerRow === -1) continue;
        
        // 取引データを抽出
        let openingBalance = 0;
        let totalDebit = 0;
        let totalCredit = 0;
        let closingBalance = 0;
        let transactionCount = 0;
        
        for (let i = headerRow + 1; i < sheet.length; i++) {
          const row = sheet[i];
          if (!row || !row[0]) continue;
          
          const dateStr = String(row[0]).trim();
          if (!dateStr || dateStr === ' ') continue;
          
          // 前月繰越行をスキップ
          if (row[1] && String(row[1]).includes('前月繰越')) {
            if (row[9] && typeof row[9] === 'number') {
              openingBalance = row[9];
            }
            continue;
          }
          
          // 日付をパース
          const transactionDate = parseJapaneseDate(dateStr);
          if (!transactionDate) continue;
          
          // 取引データを作成
          const transaction = {
            report_month: reportMonth,
            account_code: accountInfo.code,
            transaction_date: transactionDate,
            counter_account: row[1] ? String(row[1]).trim() : null,
            department: row[2] ? String(row[2]).trim() : null,
            description: row[2] ? String(row[2]).trim() : null,
            debit_amount: row[5] && typeof row[5] === 'number' ? row[5] : 0,
            credit_amount: row[7] && typeof row[7] === 'number' ? row[7] : 0,
            balance: row[9] && typeof row[9] === 'number' ? row[9] : null,
            sheet_no: processedSheets + 1,
            row_no: i + 1
          };
          
          allTransactions.push(transaction);
          transactionCount++;
          totalDebit += transaction.debit_amount;
          totalCredit += transaction.credit_amount;
          
          if (transaction.balance !== null) {
            closingBalance = transaction.balance;
          }
        }
        
        // 月次残高を記録
        if (transactionCount > 0 || openingBalance !== 0) {
          monthlyBalances.push({
            account_code: accountInfo.code,
            report_month: reportMonth,
            opening_balance: openingBalance,
            total_debit: totalDebit,
            total_credit: totalCredit,
            closing_balance: closingBalance,
            transaction_count: transactionCount
          });
        }
        
        processedSheets++;
        
      } catch (sheetError) {
        errors.push(`シート${sheetName}の処理エラー: ${sheetError.message}`);
      }
    }

    // データベースに保存
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
          errors.push(`取引データ挿入エラー: ${insertError.message}`);
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
      }
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
      { error: 'インポート処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
