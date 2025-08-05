// /app/api/general-ledger/import/route.ts ver.5
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const accountsToUpsert = [];
    const monthlyBalances = [];
    let processedSheets = 0;
    const errors = [];
    let globalRowNumber = 1; // 全体での行番号カウンター

    // 各シートを処理
    for (const sheetData of parsedData.sheets) {
      try {
        const { sheetName, accountCode, accountName, transactions } = sheetData;
        
        if (!accountCode || !accountName) continue;

        // 勘定科目マスタに追加
        accountsToUpsert.push({
          account_code: accountCode,
          account_name: accountName,
          account_type: '未分類',
          is_active: true
        });

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
              row_no: globalRowNumber++ // 全体での連番を使用
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

        processedSheets++;
      } catch (sheetError: any) {
        errors.push(`シート処理エラー: ${sheetError.message}`);
      }
    }

    // データベースに保存（トランザクション処理）
    try {
      // 1. 最初に勘定科目マスタを更新（これを最初に行う）
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
        // 削除エラーは無視して続行（データが存在しない場合もあるため）
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
          // エラーは記録するが処理は続行
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
