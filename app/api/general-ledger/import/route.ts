// /app/api/general-ledger/import/route.ts ver.8
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const fileData = formData.get('fileData') as string;
    const reportMonth = formData.get('reportMonth') as string;

    if (!fileData || !reportMonth) {
      return NextResponse.json(
        { error: '必要な情報が不足しています' },
        { status: 400 }
      );
    }

    // Base64デコード
    const parsedData = JSON.parse(fileData);
    
    const allTransactions = [];
    const accountsMap = new Map<string, any>(); // 重複を防ぐためMapを使用
    const monthlyBalances = [];
    let processedSheets = 0;
    const errors = [];
    let globalRowNumber = 1;

    // 各シートを処理
    for (const sheetData of parsedData.sheets) {
      try {
        const { sheetName, accountCode: originalCode, accountName, transactions } = sheetData;
        
        if (!accountName) continue;

        // 勘定科目コードを生成（元のコードが07003の場合は勘定科目名から生成）
        let accountCode = originalCode;
        if (originalCode === '07003' || !originalCode || originalCode.length < 4) {
          accountCode = generateAccountCode(accountName, processedSheets);
        }

        console.log(`処理中: ${accountName} (コード: ${accountCode})`);

        // 勘定科目マスタに追加（重複チェック）
        if (!accountsMap.has(accountCode)) {
          accountsMap.set(accountCode, {
            account_code: accountCode,
            account_name: accountName,
            account_type: '未分類',
            is_active: true
          });
        }

        // 取引データを追加
        let openingBalance = 0;
        let totalDebit = 0;
        let totalCredit = 0;
        let closingBalance = 0;

        transactions.forEach((trans: any) => {
          if (trans.isOpeningBalance) {
            openingBalance = trans.balance || 0;
          } else {
            allTransactions.push({
              report_month: reportMonth,
              account_code: accountCode,
              transaction_date: trans.date,
              counter_account: trans.counterAccount,
              description: trans.description,
              debit_amount: trans.debit || 0,
              credit_amount: trans.credit || 0,
              balance: trans.balance,
              sheet_no: processedSheets + 1,
              row_no: globalRowNumber++
            });

            totalDebit += trans.debit || 0;
            totalCredit += trans.credit || 0;
            
            if (trans.balance !== null) {
              closingBalance = trans.balance;
            }
          }
        });

        // 月次残高を記録
        if (transactions.length > 0) {
          const existingBalance = monthlyBalances.find(
            b => b.account_code === accountCode && b.report_month === reportMonth
          );
          
          if (existingBalance) {
            // 既存の残高に加算
            existingBalance.total_debit += totalDebit;
            existingBalance.total_credit += totalCredit;
            existingBalance.closing_balance = closingBalance;
            existingBalance.transaction_count += transactions.filter((t: any) => !t.isOpeningBalance).length;
          } else {
            // 新規追加
            monthlyBalances.push({
              account_code: accountCode,
              report_month: reportMonth,
              opening_balance: openingBalance,
              total_debit: totalDebit,
              total_credit: totalCredit,
              closing_balance: closingBalance,
              transaction_count: transactions.filter((t: any) => !t.isOpeningBalance).length
            });
          }
        }

        processedSheets++;
      } catch (sheetError: any) {
        errors.push(`シート処理エラー: ${sheetError.message}`);
      }
    }

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
      { error: 'インポート処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
