// /app/api/general-ledger/import/route.ts ver.2
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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

// CSV行から数値を安全に取得
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
    const accountCode = formData.get('accountCode') as string;
    const accountName = formData.get('accountName') as string;

    if (!file || !reportMonth || !accountCode || !accountName) {
      return NextResponse.json(
        { error: '必要な情報が不足しています' },
        { status: 400 }
      );
    }

    // CSVファイルを読み込む
    const text = await file.text();
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSVファイルが空です' },
        { status: 400 }
      );
    }

    // 勘定科目マスタに登録/更新
    const { error: accountError } = await supabase
      .from('account_master')
      .upsert({
        account_code: accountCode,
        account_name: accountName,
        account_type: '未分類',
        is_active: true
      }, {
        onConflict: 'account_code'
      });

    if (accountError) {
      console.error('勘定科目マスタ更新エラー:', accountError);
    }

    // CSVデータを解析
    const transactions = [];
    let openingBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    let closingBalance = 0;
    let rowNumber = 0;

    // ヘッダー行をスキップ
    let startIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('日付') || lines[i].includes('相手科目')) {
        startIndex = i + 1;
        break;
      }
    }

    // データ行を処理
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // CSVをカンマで分割（エスケープされたカンマに注意）
      const columns = line.split(',').map(col => col.trim().replace(/^"|"$/g, ''));
      
      if (columns.length < 6) continue;

      rowNumber++;
      
      // 日付
      const dateStr = columns[0];
      if (!dateStr || dateStr === '') continue;

      // 前月繰越行の処理
      if (columns[1] && columns[1].includes('前月繰越')) {
        openingBalance = parseNumber(columns[5]);
        continue;
      }

      // 日付をパース
      const transactionDate = parseJapaneseDate(dateStr);
      if (!transactionDate) continue;

      // 借方・貸方金額の位置を調整（CSVの列構成に応じて）
      const debitAmount = parseNumber(columns[3]) || 0;
      const creditAmount = parseNumber(columns[4]) || 0;
      const balance = parseNumber(columns[5]) || null;

      const transaction = {
        report_month: reportMonth,
        account_code: accountCode,
        transaction_date: transactionDate,
        counter_account: columns[1] || null,
        description: columns[2] || null,
        debit_amount: debitAmount,
        credit_amount: creditAmount,
        balance: balance,
        sheet_no: 1,
        row_no: rowNumber
      };

      transactions.push(transaction);
      totalDebit += debitAmount;
      totalCredit += creditAmount;

      if (balance !== null) {
        closingBalance = balance;
      }
    }

    // 既存データを削除
    const { error: deleteError } = await supabase
      .from('general_ledger')
      .delete()
      .eq('report_month', reportMonth)
      .eq('account_code', accountCode);

    if (deleteError) {
      console.error('既存データ削除エラー:', deleteError);
    }

    // 新規データを挿入
    if (transactions.length > 0) {
      const { error: insertError } = await supabase
        .from('general_ledger')
        .insert(transactions);

      if (insertError) {
        console.error('取引データ挿入エラー:', insertError);
        return NextResponse.json(
          { error: '取引データの保存に失敗しました' },
          { status: 500 }
        );
      }
    }

    // 月次残高を更新
    const { error: balanceError } = await supabase
      .from('monthly_account_balance')
      .upsert({
        account_code: accountCode,
        report_month: reportMonth,
        opening_balance: openingBalance,
        total_debit: totalDebit,
        total_credit: totalCredit,
        closing_balance: closingBalance,
        transaction_count: transactions.length
      }, {
        onConflict: 'account_code,report_month'
      });

    if (balanceError) {
      console.error('月次残高更新エラー:', balanceError);
    }

    return NextResponse.json({
      success: true,
      message: `${accountName}のデータをインポートしました`,
      details: {
        transactions: transactions.length,
        totalDebit,
        totalCredit,
        closingBalance
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
