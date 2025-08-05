// /app/api/general-ledger/import/route.ts ver.14
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// CSVパーサー（シンプルで確実）
function parseCSVLine(line: string): string[] {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

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
function parseNumber(value: string): number {
  if (!value) return 0;
  // カンマとスペースを除去
  const cleaned = value.replace(/[,、\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
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
    const monthlyBalancesMap = new Map<string, any>();
    let processedSheets = 0;
    const errors = [];
    let globalRowNumber = 1;
    
    console.log(`総シート数: ${workbook.SheetNames.length}`);
    
    // 各シートを処理
    for (const [sheetIndex, sheetName] of workbook.SheetNames.entries()) {
      try {
        const worksheet = workbook.Sheets[sheetName];
        
        // シートをCSV形式に変換（これが重要！）
        const csv = XLSX.utils.sheet_to_csv(worksheet, {
          FS: ',',
          RS: '\n',
          strip: false,
          blankrows: false
        });
        
        const lines = csv.split('\n').filter(line => line.trim() !== '');
        
        console.log(`\nシート${sheetIndex + 1} (${sheetName}) をCSVに変換`);
        console.log(`行数: ${lines.length}`);
        
        if (lines.length < 5) {
          continue;
        }
        
        // 最初の10行をログ出力（デバッグ用）
        console.log('最初の5行:');
        lines.slice(0, 5).forEach((line, idx) => {
          console.log(`行${idx}: ${line}`);
        });
        
        // 勘定科目情報を探す
        let accountCode = '';
        let accountName = '';
        
        // 2行目から勘定科目情報を探す
        for (let i = 1; i < Math.min(5, lines.length); i++) {
          const columns = parseCSVLine(lines[i]);
          
          // パターン1: "100","本","社","現","金" のような分割
          if (columns[0] && /^\d+$/.test(columns[0])) {
            accountCode = columns[0];
            // 次の列から勘定科目名を結合
            const nameParts = [];
            for (let j = 1; j < columns.length; j++) {
              if (columns[j] && !columns[j].includes('ページ')) {
                nameParts.push(columns[j]);
              } else {
                break;
              }
            }
            if (nameParts.length > 0) {
              accountName = nameParts.join('');
              console.log(`勘定科目を発見: コード=${accountCode}, 名前=${accountName}`);
              break;
            }
          }
          
          // パターン2: "100 本 社 現 金" のような結合
          for (const col of columns) {
            const match = col.match(/^(\d+)\s+(.+)$/);
            if (match) {
              accountCode = match[1];
              accountName = match[2].replace(/\s+/g, '');
              console.log(`勘定科目を発見: コード=${accountCode}, 名前=${accountName}`);
              break;
            }
          }
          
          if (accountCode) break;
        }
        
        // 勘定科目が見つからない場合
        if (!accountCode) {
          accountCode = (100 + sheetIndex).toString();
          accountName = sheetName;
        }
        
        // ヘッダー行を探す
        let headerRow = -1;
        for (let i = 0; i < Math.min(10, lines.length); i++) {
          if (lines[i].includes('日') && lines[i].includes('付')) {
            headerRow = i;
            console.log(`ヘッダー行: ${i}行目`);
            break;
          }
        }
        
        if (headerRow === -1) {
          console.log(`ヘッダー行が見つかりません`);
          continue;
        }
        
        // ヘッダー行の列を解析
        const headerColumns = parseCSVLine(lines[headerRow]);
        console.log('ヘッダー列:', headerColumns);
        
        // 金額列のインデックスを特定
        let debitIndex = -1;
        let creditIndex = -1;
        let balanceIndex = -1;
        
        headerColumns.forEach((col, idx) => {
          const normalized = col.replace(/\s+/g, '');
          if (normalized.includes('借方')) debitIndex = idx;
          if (normalized.includes('貸方')) creditIndex = idx;
          if (normalized.includes('残高')) balanceIndex = idx;
        });
        
        console.log(`金額列: 借方=${debitIndex}, 貸方=${creditIndex}, 残高=${balanceIndex}`);
        
        // デフォルト値（見つからない場合）
        if (debitIndex === -1) debitIndex = 5;  // F列
        if (creditIndex === -1) creditIndex = 6; // G列
        if (balanceIndex === -1) balanceIndex = 7; // H列
        
        // 勘定科目マスタに追加
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
        
        for (let i = headerRow + 1; i < lines.length; i++) {
          const columns = parseCSVLine(lines[i]);
          
          if (columns.length < 3) continue;
          
          const dateStr = columns[0];
          if (!dateStr || dateStr.includes('以下余白')) break;
          if (dateStr.includes('月度計') || dateStr.includes('次月繰越')) continue;
          
          // 前月繰越
          if (columns[1] && columns[1].includes('前頁より繰越')) {
            openingBalance = parseNumber(columns[balanceIndex] || '0');
            console.log(`前月繰越: ${openingBalance}`);
            continue;
          }
          
          // 日付をパース
          const transactionDate = parseJapaneseDate(dateStr);
          if (!transactionDate) continue;
          
          // 金額を取得
          const debitAmount = parseNumber(columns[debitIndex] || '0');
          const creditAmount = parseNumber(columns[creditIndex] || '0');
          const balance = parseNumber(columns[balanceIndex] || '0');
          
          if (transactionCount === 0 && (debitAmount > 0 || creditAmount > 0)) {
            console.log(`最初の取引: 借方=${debitAmount}, 貸方=${creditAmount}, 残高=${balance}`);
          }
          
          allTransactions.push({
            report_month: reportMonth,
            account_code: accountCode,
            transaction_date: transactionDate,
            counter_account: columns[1] || null,
            description: columns[3] || null,
            debit_amount: Math.round(debitAmount),
            credit_amount: Math.round(creditAmount),
            balance: Math.round(balance),
            sheet_no: sheetIndex + 1,
            row_no: globalRowNumber++
          });
          
          totalDebit += debitAmount;
          totalCredit += creditAmount;
          if (balance !== 0) closingBalance = balance;
          transactionCount++;
        }
        
        console.log(`処理完了: ${transactionCount}件、借方計${totalDebit}、貸方計${totalCredit}`);
        
        // 月次残高を記録
        if (transactionCount > 0) {
          const balanceKey = `${accountCode}-${reportMonth}`;
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
        
        processedSheets++;
      } catch (sheetError) {
        console.error(`シート${sheetName}の処理エラー:`, sheetError);
        errors.push(`シート${sheetName}: ${sheetError instanceof Error ? sheetError.message : 'エラー'}`);
      }
    }

    // データベースに保存（既存のコードと同じ）
    const accountsToUpsert = Array.from(accountsMap.values());
    const monthlyBalances = Array.from(monthlyBalancesMap.values());

    console.log(`\n処理完了: ${processedSheets}シート, ${allTransactions.length}件の取引`);

    // 以下、データベース保存処理は既存のコードと同じ...
    try {
      // 1. 勘定科目マスタを更新
      if (accountsToUpsert.length > 0) {
        const { error: accountError } = await supabase
          .from('account_master')
          .upsert(accountsToUpsert, { 
            onConflict: 'account_code',
            ignoreDuplicates: false 
          });
          
        if (accountError) throw accountError;
      }

      // 2. 既存データを削除
      await supabase
        .from('general_ledger')
        .delete()
        .eq('report_month', reportMonth);

      // 3. 新規データを挿入
      if (allTransactions.length > 0) {
        for (let i = 0; i < allTransactions.length; i += 500) {
          const batch = allTransactions.slice(i, i + 500);
          const { error: insertError } = await supabase
            .from('general_ledger')
            .insert(batch);
            
          if (insertError) throw insertError;
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
          errors.push(`月次残高更新エラー: ${balanceError.message}`);
        }
      }

    } catch (dbError: any) {
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
