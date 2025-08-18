// /components/finance/CashFlow.tsx ver.6
'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { TrendingUp, TrendingDown, DollarSign, Loader2 } from 'lucide-react';

/**
 * 変更点（ver.6）
 * - month のバリデーションと早期リターンを追加（undefined-01 が飛ぶのを防止）
 * - 前月計算を文字列演算で安全に算出（Date 依存を回避）
 */

interface CashFlowData {
  operatingActivities: {
    netIncome: number;
    depreciation: number;
    receivablesChange: number;
    inventoryChange: number;
    payablesChange: number;
    otherOperating: number;
    total: number;
  };
  investingActivities: {
    capitalExpenditures: number;
    assetSales: number;
    otherInvesting: number;
    total: number;
  };
  financingActivities: {
    loanProceeds: number;
    loanRepayments: number;
    dividendsPaid: number;
    otherFinancing: number;
    total: number;
  };
  cashBeginning: number;
  cashEnding: number;
  netCashFlow: number;
}

interface CashFlowProps {
  month: string; // YYYY-MM
  includingClosing: boolean;
}

// 勘定科目コード → 勘定区分（決算仕訳用）
const getAccountTypeFromCode = (code: string): string => {
  const codeNum = parseInt(code);
  if (codeNum >= 100 && codeNum < 200) return '資産';
  if (codeNum >= 200 && codeNum < 300) return '負債';
  if (codeNum >= 300 && codeNum < 400) return '純資産';
  if (codeNum >= 400 && codeNum < 600) return '費用';
  if (codeNum >= 600 && codeNum < 610) return '営業外収益';
  if (codeNum === 610) return '営業外費用';
  if (codeNum >= 800 && codeNum < 900) return '収益';
  if (codeNum >= 1000 && codeNum < 1200) return '資産';
  if (codeNum >= 1200 && codeNum < 1300) return '負債';
  return '未分類';
};

// 簡易キャッシュフロー計算
const calculateCashFlow = (
  transactions: any[],
  cashBeginBalance: number,
  cashEndBalance: number
): CashFlowData => {
  let revenues = 0;
  let expenses = 0;
  let depreciation = 0;

  transactions.forEach((t) => {
    const accountType = t.account_type || '';
    const accountName = t.account_name || '';

    if (accountType === '収益' || accountType === '営業外収益') {
      revenues += (t.credit_amount || 0) - (t.debit_amount || 0);
    } else if (accountType === '費用' || accountType === '営業外費用') {
      expenses += (t.debit_amount || 0) - (t.credit_amount || 0);

      if (accountName.includes('減価償却')) {
        depreciation += (t.debit_amount || 0) - (t.credit_amount || 0);
      }
    }
  });

  const netIncome = revenues - expenses;

  const operatingCF = {
    netIncome,
    depreciation,
    receivablesChange: 0,
    inventoryChange: 0,
    payablesChange: 0,
    otherOperating: 0,
    total: netIncome + depreciation
  };

  const investingCF = {
    capitalExpenditures: 0,
    assetSales: 0,
    otherInvesting: 0,
    total: 0
  };

  let loanProceeds = 0;
  let loanRepayments = 0;

  transactions.forEach((t) => {
    const accountName = t.account_name || '';
    if (accountName.includes('借入金')) {
      loanProceeds += t.credit_amount || 0;
      loanRepayments += t.debit_amount || 0;
    }
  });

  const financingCF = {
    loanProceeds,
    loanRepayments,
    dividendsPaid: 0,
    otherFinancing: 0,
    total: loanProceeds - loanRepayments
  };

  const netCashFlow = operatingCF.total + investingCF.total + financingCF.total;

  return {
    operatingActivities: operatingCF,
    investingActivities: investingCF,
    financingActivities: financingCF,
    cashBeginning: cashBeginBalance,
    cashEnding: cashEndBalance,
    netCashFlow
  };
};

const formatAmount = (amount: number): string =>
  new Intl.NumberFormat('ja-JP').format(Math.abs(amount));

const isValidMonth = (m?: string): m is string =>
  !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

// 前月（YYYY-MM）を安全に算出
const prevMonthOf = (m: string): string => {
  const [yStr, mmStr] = m.split('-');
  const y = Number(yStr);
  const mm = Number(mmStr);
  if (mm === 1) return `${y - 1}-12`;
  return `${y}-${String(mm - 1).padStart(2, '0')}`;
};

export function CashFlow({ month, includingClosing }: CashFlowProps) {
  const [cashFlowData, setCashFlowData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCashFlowData = async () => {
      setLoading(true);
      setError(null);

      // ▼ ver.6 追加：month ガード
      if (!isValidMonth(month)) {
        setError('月が未選択または不正です（YYYY-MM 形式）');
        setLoading(false);
        return;
      }

      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // 選択月と前月
        const targetMonth = month; // YYYY-MM
        const previousMonth = prevMonthOf(targetMonth);

        // 期首残高（前月末）
        const { data: cashBeginData, error: cashBeginError } = await supabase
          .from('monthly_account_balance')
          .select('closing_balance')
          .eq('report_month', `${previousMonth}-01`)
          .in('account_code', ['100', '103', '106']);

        if (cashBeginError) {
          console.error('期首残高取得エラー:', cashBeginError);
        }

        // 期末残高（当月末）
        const { data: cashEndData, error: cashEndError } = await supabase
          .from('monthly_account_balance')
          .select('closing_balance')
          .eq('report_month', `${targetMonth}-01`)
          .in('account_code', ['100', '103', '106']);

        if (cashEndError) {
          console.error('期末残高取得エラー:', cashEndError);
        }

        // 当月の仕訳（勘定科目JOIN）
        let allTransactions: any[] = [];
        let offset = 0;
        const limit = 1000;

        while (true) {
          const { data, error } = await supabase
            .from('general_ledger')
            .select('*, account_master(account_name, account_type)')
            .eq('report_month', `${targetMonth}-01`)
            .range(offset, offset + limit - 1);

          if (error) {
            console.error('取引データ取得エラー:', error);
            throw error;
          }
          if (!data || data.length === 0) break;

          const flat = data.map((item: any) => ({
            ...item,
            account_name: item.account_master?.account_name || '',
            account_type: item.account_master?.account_type || ''
          }));

          allTransactions = allTransactions.concat(flat);
          if (data.length < limit) break;
          offset += limit;
        }

        // 決算調整（2024-07 のみ）
        if (includingClosing && targetMonth === '2024-07') {
          const { data: closingData, error: closingErr } = await supabase
            .from('closing_adjustments')
            .select('*')
            .eq('fiscal_year', 2024);

          if (closingErr) {
            console.error('決算調整データ取得エラー:', closingErr);
          } else if (closingData?.length) {
            const closingWithType = closingData.map((item: any) => ({
              ...item,
              account_type: getAccountTypeFromCode(item.account_code)
            }));
            allTransactions = allTransactions.concat(closingWithType);
          }
        }

        // 現金残高（合算）
        const cashBeginBalance =
          cashBeginData?.reduce((s, d) => s + (d.closing_balance || 0), 0) ?? 0;
        const cashEndBalance =
          cashEndData?.reduce((s, d) => s + (d.closing_balance || 0), 0) ?? 0;

        // 計算
        const calc = calculateCashFlow(allTransactions, cashBeginBalance, cashEndBalance);
        setCashFlowData(calc);
      } catch (err) {
        console.error('Error fetching cash flow data:', err);
        setError('キャッシュフローデータの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchCashFlowData();
  }, [month, includingClosing]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (error || !cashFlowData) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">キャッシュフロー計算書</h3>
        <div className="text-center py-8 text-red-500">
          <p>{error || 'データの取得に失敗しました'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-6">キャッシュフロー計算書</h3>

      <div className="space-y-6">
        {/* 営業活動によるキャッシュフロー */}
        <div className="border rounded-lg p-4">
          <h4 className="font-semibold mb-3 flex items-center">
            <DollarSign className="h-5 w-5 mr-2 text-blue-600" />
            営業活動によるキャッシュフロー
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">当期純利益</span>
              <span
                className={
                  cashFlowData.operatingActivities.netIncome >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }
              >
                {cashFlowData.operatingActivities.netIncome >= 0 ? '' : '△'}
                {formatAmount(cashFlowData.operatingActivities.netIncome)}
              </span>
            </div>
            {cashFlowData.operatingActivities.depreciation > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">減価償却費</span>
                <span>{formatAmount(cashFlowData.operatingActivities.depreciation)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t pt-2">
              <span>小計</span>
              <span
                className={
                  cashFlowData.operatingActivities.total >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }
              >
                {cashFlowData.operatingActivities.total >= 0 ? '' : '△'}
                {formatAmount(cashFlowData.operatingActivities.total)}
              </span>
            </div>
          </div>
        </div>

        {/* 投資活動によるキャッシュフロー */}
        <div className="border rounded-lg p-4">
          <h4 className="font-semibold mb-3 flex items-center">
            <TrendingDown className="h-5 w-5 mr-2 text-orange-600" />
            投資活動によるキャッシュフロー
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">（データなし）</span>
              <span>0</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-2">
              <span>小計</span>
              <span>0</span>
            </div>
          </div>
        </div>

        {/* 財務活動によるキャッシュフロー */}
        <div className="border rounded-lg p-4">
          <h4 className="font-semibold mb-3 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-purple-600" />
            財務活動によるキャッシュフロー
          </h4>
          <div className="space-y-2 text-sm">
            {cashFlowData.financingActivities.loanProceeds > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">借入による収入</span>
                <span>{formatAmount(cashFlowData.financingActivities.loanProceeds)}</span>
              </div>
            )}
            {cashFlowData.financingActivities.loanRepayments > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">借入金の返済</span>
                <span className="text-red-600">
                  △{formatAmount(cashFlowData.financingActivities.loanRepayments)}
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t pt-2">
              <span>小計</span>
              <span
                className={
                  cashFlowData.financingActivities.total >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }
              >
                {cashFlowData.financingActivities.total >= 0 ? '' : '△'}
                {formatAmount(cashFlowData.financingActivities.total)}
              </span>
            </div>
          </div>
        </div>

        {/* 現金及び現金同等物の増減 */}
        <div className="border-t-2 border-gray-300 pt-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">現金及び現金同等物の期首残高</span>
              <span>{formatAmount(cashFlowData.cashBeginning)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>現金及び現金同等物の増減額</span>
              <span
                className={
                  cashFlowData.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'
                }
              >
                {cashFlowData.netCashFlow >= 0 ? '' : '△'}
                {formatAmount(cashFlowData.netCashFlow)}
              </span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>現金及び現金同等物の期末残高</span>
              <span className="text-blue-600">
                {formatAmount(cashFlowData.cashEnding)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
