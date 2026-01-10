// app/api/finance/trial-balance/route.ts
// 既存のmonthly_account_balance, account_masterテーブルを使用
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 勘定科目の分類（既存ルールに準拠）
function classifyAccount(code: string, name: string): string {
  const codeNum = parseInt(code, 10);
  if (isNaN(codeNum)) return 'その他';

  if (codeNum >= 100 && codeNum <= 199) return '資産';
  if (codeNum >= 1000 && codeNum <= 1099) return '資産';
  if (codeNum >= 1100 && codeNum <= 1199) return '資産';
  if (codeNum >= 200 && codeNum <= 299) return '負債';
  if (codeNum >= 1200 && codeNum <= 1299) return '負債';
  if (codeNum >= 300 && codeNum <= 399) return '純資産';
  if (codeNum >= 400 && codeNum <= 499) return '費用';
  if (codeNum >= 500 && codeNum <= 599) return '費用';
  if (codeNum >= 600 && codeNum <= 699) return '費用';
  if (codeNum >= 800 && codeNum <= 899) return '収益';

  if (codeNum >= 3000 && codeNum <= 3999) {
    if (name.includes('資産') || name.includes('償却')) return '資産';
    if (name.includes('債務')) return '負債';
  }

  return 'その他';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    if (!month) {
      return NextResponse.json({ error: '対象月が必要です' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const monthDate = `${month}-01`;

    // monthly_account_balance を取得
    const { data: balanceData, error: balanceError } = await supabase
      .from('monthly_account_balance')
      .select('*')
      .eq('report_month', monthDate)
      .order('account_code');

    if (balanceError) {
      console.error('Balance query error:', balanceError);
      return NextResponse.json({ error: 'データ取得に失敗しました' }, { status: 500 });
    }

    // account_masterから科目名を取得
    const { data: masterData } = await supabase
      .from('account_master')
      .select('account_code, account_name');

    // 科目名のマップを作成
    const accountNames: Record<string, string> = {};
    (masterData || []).forEach((m: any) => {
      accountNames[m.account_code] = m.account_name;
    });

    if (!balanceData || balanceData.length === 0) {
      return NextResponse.json({
        accounts: [],
        summary: null,
        message: '該当月のデータがありません',
      });
    }

    // データを整形
    const accounts = balanceData.map((row: any) => {
      const name = accountNames[row.account_code] || row.account_code;
      return {
        code: row.account_code,
        name: name,
        category: classifyAccount(row.account_code, name),
        openingBalance: Number(row.opening_balance) || 0,
        debitTotal: Number(row.total_debit) || 0,
        creditTotal: Number(row.total_credit) || 0,
        closingBalance: Number(row.closing_balance) || 0,
        transactionCount: Number(row.transaction_count) || 0,
      };
    });

    // サマリー計算
    const assets = accounts.filter((a: any) => a.category === '資産');
    const liabilities = accounts.filter((a: any) => a.category === '負債');
    const equity = accounts.filter((a: any) => a.category === '純資産');
    const revenues = accounts.filter((a: any) => a.category === '収益');
    const expenses = accounts.filter((a: any) => a.category === '費用');

    const sum = (arr: any[]) => arr.reduce((s, a) => s + a.closingBalance, 0);

    const totalAssets = sum(assets);
    const totalLiabilities = sum(liabilities);
    const totalEquity = sum(equity);
    const totalRevenues = revenues.reduce(
      (s: number, a: any) => s + (a.creditTotal - a.debitTotal),
      0
    );
    const totalExpenses = expenses.reduce(
      (s: number, a: any) => s + (a.debitTotal - a.creditTotal),
      0
    );

    const summary = {
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalRevenues,
      totalExpenses,
      netIncome: totalRevenues - totalExpenses,
      bsBalance: totalAssets - totalLiabilities - totalEquity,
    };

    return NextResponse.json({ accounts, summary, month });
  } catch (error) {
    console.error('Trial balance error:', error);
    return NextResponse.json({ error: '処理中にエラーが発生しました' }, { status: 500 });
  }
}

// 利用可能な月一覧を取得
export async function OPTIONS() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('monthly_account_balance')
      .select('report_month')
      .order('report_month', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'データ取得に失敗しました' }, { status: 500 });
    }

    const months = [...new Set(data?.map((d: any) => d.report_month?.substring(0, 7)))].filter(Boolean);
    return NextResponse.json({ months });
  } catch (error) {
    return NextResponse.json({ error: 'エラーが発生しました' }, { status: 500 });
  }
}
