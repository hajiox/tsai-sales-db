// /app/api/general-ledger/import/route.ts ver.12
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
    const accountsMap = new Map<string, any>();
    const monthlyBalancesMap = new Map<string, any>(); // 重複を防ぐためMapを使用
    let processedSheets = 0;
    const errors = [];
    let globalRowNumber = 1;
    
    console.log(`総シート数: ${workbook.SheetNames.length}`);
    console.log(`最初の5つのシート名:`, workbook.SheetNames.slice(0, 5));
    
    // 各シートを処理
    workbook.SheetNames.forEach((sheetName, sheetIndex) => {
      try {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];
        
        if (!jsonData || jsonData.length < 5) {
          return;
        }
        
        console.log(`\nシート${sheetIndex + 1} (${sheetName}) の処理開始`);
        
        // 勘定科目情報を抽出
        let accountCode = '';
        let accountName = '';
        
        // 2行目から勘定科目情報を探す（A列からE列まで）
        if (jsonData[1]) {
          console.log(`2行目のデータ:`, jsonData[1].slice(0, 5));
          
          // A列に数字があればそれが勘定科目コード
          if (jsonData[1][0] && /^\d+$/.test(String(jsonData[1][0]).trim())) {
            accountCode = String(jsonData[1][0]).trim();
          }
          
          // C列（インデックス2）に勘定科目名がある
          if (jsonData[1][2]) {
            const cellValue = String(jsonData[1][2]).trim();
            if (cellValue && !cellValue.includes('ﾍﾟｰｼﾞ') && !cellValue.includes('ページ')) {
              accountName = cellValue;
            }
          }
        }
        
        // 3行目も確認（科目コードが3行目にある場合）
        if (!accountCode && jsonData[2]) {
          console.log(`3行目のデータ:`, jsonData[2].slice(0, 5));
          
          if (jsonData[2][0] && /^\d+$/.test(String(jsonData[2][0]).trim())) {
            accountCode = String(jsonData[2][0]).trim();
          }
        }
        
        // 勘定科目名が取得できない場合は、シート名を使用
        if (!accountName) {
          accountName = sheetName;
        }
        
        // コードが取得できない場合は連番
        if (!accountCode) {
          accountCode = (100 + sheetIndex).toString();
        }
        
        console.log(`取得した勘定科目: コード=${accountCode}, 名前=${accountName}`);
        
        // ヘッダー行を探す（「日付」を含む行）
        let headerRow = -1;
        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
          if (jsonData[i] && jsonData[i][0] && 
              (String(jsonData[i][0]).includes('日') && String(jsonData[i][0]).includes('付'))) {
            headerRow = i;
            console.log(`ヘッダー行: ${i}行目`);
            break;
          }
        }
        
        if (headerRow === -1) {
          console.log(`ヘッダー行が見つかりません`);
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
        } else {
          // 既存のコードがある場合、名前を更新
          const existing = accountsMap.get(accountCode);
          if (existing && existing.account_name === `sheet${sheetIndex}`) {
            existing.account_name = accountName;
          }
        }
        
        // 取引データを抽出
        let openingBalance = 0;
        let totalDebit = 0;
        let totalCredit = 0;
        let closingBalance = 0;
        let transactionCount = 0;
        let firstTransaction = true;
        
        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || !row[0]) continue;
          
          const dateStr = String(row[0]).trim();
          if (!dateStr || dateStr === '') continue;
          
          // 前月繰越行の処理
          if (row[1] && String(row[1]).includes('前月繰越')) {
            openingBalance = parseNumber(row[7]); // H列が残高
            console.log(`前月繰越: ${openingBalance}`);
            continue;
          }
          
          // 日付をパース
          const transactionDate = parseJapaneseDate(dateStr);
          if (!transactionDate) continue;
          
          // 金額列の位置（画像から確認済み）
          // F列（インデックス5）: 借方金額
          // G列（インデックス6）: 貸方金額  
          // H列（インデックス7）: 残高
          const debitAmount = parseNumber(row[5]);
          const creditAmount = parseNumber(row[6]);
          const balance = parseNumber(row[7]);
          
          // 最初の取引データをログ出力
          if (firstTransaction) {
            console.log(`最初の取引: 日付=${transactionDate}, 借方=${debitAmount}, 貸方=${creditAmount}, 残高=${balance}`);
            console.log(`元データ: F列=${row[5]}, G列=${row[6]}, H列=${row[7]}`);
            firstTransaction = false;
          }
          
          allTransactions.push({
            report_month: reportMonth,
            account_code: accountCode,
            transaction_date: transactionDate,
            counter_account: row[1] ? String(row[1]).trim() : null,
            description: row[3] ? String(row[3]).trim() : null, // D列が摘要
            debit_amount: Math.round(debitAmount), // 整数に変換
            credit_amount: Math.round(creditAmount), // 整数に変換
            balance: Math.round(balance), // 整数に変換
            sheet_no: sheetIndex + 1,
            row_no: globalRowNumber++
          });
          
          totalDebit += debitAmount;
          totalCredit += creditAmount;
          
          if (balance !== 0) {
            closingBalance = balance;
          }
          
          transactionCount++;
        }
        
        console.log(`取引件数: ${transactionCount}, 借方合計: ${totalDebit}, 貸方合計: ${totalCredit}`);
        
        // 月次残高を記録（Mapを使用して重複を防ぐ）
        if (transactionCount > 0) {
          const balanceKey = `${accountCode}-${reportMonth}`;
          const existingBalance = monthlyBalancesMap.get(balanceKey);
          
          if (existingBalance) {
            // 既存の残高に加算
            existingBalance.total_debit += Math.round(totalDebit);
            existingBalance.total_credit += Math.round(totalCredit);
            existingBalance.closing_balance = Math.round(closingBalance);
            existingBalance.transaction_count += transactionCount;
          } else {
            // 新規追加
            monthlyBalancesMap.set(balanceKey, {
              account_code: accountCode,
              report_month: reportMonth,
              opening_balance: Math.round(openingBalance),
              total_debit: Math.round(totalDebit),
              total_credit: Math.round(totalCredit),
              closing_balance: Math.round(closingBalance),
              transaction_count: transactionCount
            });
          }
        }
        
        processedSheets++;
      } catch (sheetError) {
        console.error(`シート${sheetName}の処理エラー:`, sheetError);
        errors.push(`シート${sheetName}: ${sheetError instanceof Error ? sheetError.message : 'エラー'}`);
      }
    });

    // MapからArrayに変換
    const accountsToUpsert = Array.from(accountsMap.values());
    const monthlyBalances = Array.from(monthlyBalancesMap.values());

    console.log(`\n処理完了: ${processedSheets}シート, ${allTransactions.length}件の取引, ${accountsToUpsert.length}件の勘定科目`);

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
