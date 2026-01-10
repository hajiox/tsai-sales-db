// app/api/finance/transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const accountCode = searchParams.get('accountCode');

    if (!month || !accountCode) {
      return NextResponse.json(
        { error: '対象月と勘定科目コードが必要です' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const monthDate = `${month}-01`;

    const { data, error } = await supabase
      .from('general_ledger')
      .select('*')
      .eq('report_month', monthDate)
      .eq('account_code', accountCode)
      .order('transaction_date')
      .order('row_no');

    if (error) {
      console.error('Query error:', error);
      return NextResponse.json({ error: 'データ取得に失敗しました' }, { status: 500 });
    }

    const transactions = (data || []).map((row: any) => ({
      date: row.transaction_date,
      counterAccount: row.counter_account || '',
      description: row.description || '',
      debit: Number(row.debit_amount) || 0,
      credit: Number(row.credit_amount) || 0,
      balance: Number(row.balance) || 0,
    }));

    return NextResponse.json({
      accountCode,
      month,
      transactions,
      count: transactions.length,
    });
  } catch (error) {
    console.error('Transactions error:', error);
    return NextResponse.json({ error: '処理中にエラーが発生しました' }, { status: 500 });
  }
}
