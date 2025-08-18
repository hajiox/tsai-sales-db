// /components/finance/FinancialStatementsContent.tsx ver.5
'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { FileSpreadsheet, BarChart3, Calendar, FileText, ToggleLeft, ToggleRight } from 'lucide-react';
import { BalanceSheet } from '@/components/finance/BalanceSheet';
import { ProfitLoss } from '@/components/finance/ProfitLoss';
import { CashFlow } from '@/components/finance/CashFlow';
import { DetailSearch } from '@/components/finance/DetailSearch';
import { FinancialReport } from '@/components/finance/FinancialReport';
import { AccountBalance } from '@/types/finance';

export default function FinancialStatementsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const getInitialMonth = () => {
    const monthParam = searchParams.get('month');
    if (monthParam) return monthParam;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };
  
  const [selectedMonth, setSelectedMonth] = useState(getInitialMonth());
  const [activeTab, setActiveTab] = useState<'bs' | 'pl' | 'cf' | 'detail' | 'report'>('bs');
  const [isLoading, setIsLoading] = useState(true);
  const [includeClosing, setIncludeClosing] = useState(false);
  const [showCumulative, setShowCumulative] = useState(false); // 通期累計表示フラグ
  
  const [bsData, setBsData] = useState<{
    assets: AccountBalance[];
    liabilities: AccountBalance[];
    equity: AccountBalance[];
  }>({ assets: [], liabilities: [], equity: [] });
  
  const [plData, setPlData] = useState<{
    revenues: AccountBalance[];
    expenses: AccountBalance[];
  }>({ revenues: [], expenses: [] });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', newMonth);
    router.push(`${pathname}?${params.toString()}`);
  };

  // 会計年度の開始月を取得（7月決算なので8月開始）
  const getFiscalYearStart = (month: string) => {
    const [year, monthNum] = month.split('-').map(Number);
    // 8月以降は当年度、7月以前は前年度
    const fiscalYear = monthNum >= 8 ? year : year - 1;
    return `${fiscalYear}-08-01`;
  };

  useEffect(() => {
    const authStatus = sessionStorage.getItem('financeSystemAuth');
    if (authStatus === 'authenticated') {
      loadFinancialData();
    } else {
      router.push('/finance/general-ledger');
    }
  }, [selectedMonth, includeClosing, showCumulative]);

  const loadFinancialData = async () => {
    setIsLoading(true);
    
    // 期間の設定
    let dateCondition;
    if (showCumulative) {
      // 通期累計：会計年度開始から選択月まで
      const fiscalStart = getFiscalYearStart(selectedMonth);
      dateCondition = {
        gte: fiscalStart,
        lte: `${selectedMonth}-01`
      };
    } else {
      // 単月：選択月のみ
      dateCondition = `${selectedMonth}-01`;
    }

    // 1. データの取得
    let allLedgerData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      
      const query = supabase
        .from('general_ledger')
        .select(`
          account_code,
          debit_amount,
          credit_amount,
          account_master!inner(account_name, account_type)
        `)
        .range(from, to);

      // 期間条件の適用
      if (showCumulative) {
        query.gte('report_month', dateCondition.gte)
             .lte('report_month', dateCondition.lte);
      } else {
        query.eq('report_month', dateCondition);
      }

      const { data: ledgerData } = await query;

      if (ledgerData && ledgerData.length > 0) {
        allLedgerData = [...allLedgerData, ...ledgerData];
        hasMore = ledgerData.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }

    // 2. 決算調整データの取得（7月の場合のみ）
    let closingData: any[] = [];
    const [year, month] = selectedMonth.split('-');
    const isClosingMonth = month === '07';
    
    if (isClosingMonth && includeClosing) {
      const { data: closingAdjustments } = await supabase
        .from('closing_adjustments')
        .select('*')
        .eq('fiscal_year', parseInt(year))
        .eq('fiscal_month', 7);
      
      if (closingAdjustments) {
        closingData = closingAdjustments;
      }
    }

    // 3. データの集計
    if (allLedgerData.length > 0 || closingData.length > 0) {
      const accountTotals = new Map<string, { 
        name: string, 
        type: string,
        debit: number, 
        credit: number 
      }>();
      
      // 通常月データの集計
      allLedgerData.forEach(item => {
        const code = item.account_code;
        const name = item.account_master?.account_name || '';
        const type = item.account_master?.account_type || '未分類';
        
        if (!accountTotals.has(code)) {
          accountTotals.set(code, { name, type, debit: 0, credit: 0 });
        }
        
        const account = accountTotals.get(code)!;
        account.debit += item.debit_amount || 0;
        account.credit += item.credit_amount || 0;
      });

      // 決算調整データの追加
      closingData.forEach(item => {
        const code = item.account_code;
        const name = item.account_name || '';
        
        if (!accountTotals.has(code)) {
          // 決算調整データから account_type を推定
          let type = '未分類';
          if ((code >= '100' && code < '200') || (code >= '1000' && code < '1200')) {
            type = '資産';
          } else if ((code >= '200' && code < '300') || (code >= '1200' && code < '1300')) {
            type = '負債';
          } else if (code >= '300' && code < '400') {
            type = '純資産';
          } else if (code >= '800' && code < '900') {
            type = '収益';
          } else if (code >= '600' && code < '610') {
            type = '営業外収益';
          } else if (code === '610') {
            type = '営業外費用';
          } else if (code >= '400' && code < '600') {
            type = '費用';
          }
          
          accountTotals.set(code, { name, type, debit: 0, credit: 0 });
        }
        
        const account = accountTotals.get(code)!;
        account.debit += item.debit_amount || 0;
        account.credit += item.credit_amount || 0;
      });

      // 4. 勘定科目の分類と残高計算
      const assets: AccountBalance[] = [];
      const liabilities: AccountBalance[] = [];
      const equity: AccountBalance[] = [];
      const revenues: AccountBalance[] = [];
      const expenses: AccountBalance[] = [];

      accountTotals.forEach((totals, code) => {
        let balance = 0;
        
        // account_type に基づく分類
        const isAssetType = totals.type === '資産';
        const isLiabilityType = totals.type === '負債';
        const isEquityType = totals.type === '純資産';
        const isRevenueType = totals.type === '収益' || totals.type === '営業外収益';
        const isExpenseType = totals.type === '費用' || totals.type === '営業外費用';
        
        // 資産・費用系は借方残高
        if (isAssetType || isExpenseType) {
          balance = totals.debit - totals.credit;
        } else {
          // 負債・純資産・収益系は貸方残高
          balance = totals.credit - totals.debit;
        }

        const account: AccountBalance = {
          account_code: code,
          account_name: totals.name,
          balance: Math.abs(balance)
        };

        // account_type による分類
        if (isAssetType) {
          assets.push(account);
        } else if (isLiabilityType) {
          liabilities.push(account);
        } else if (isEquityType) {
          equity.push(account);
        } else if (isRevenueType) {
          revenues.push(account);
        } else if (isExpenseType) {
          expenses.push(account);
        }
      });

      // ソート
      assets.sort((a, b) => a.account_code.localeCompare(b.account_code));
      liabilities.sort((a, b) => a.account_code.localeCompare(b.account_code));
      equity.sort((a, b) => a.account_code.localeCompare(b.account_code));
      revenues.sort((a, b) => a.account_code.localeCompare(b.account_code));
      expenses.sort((a, b) => a.account_code.localeCompare(b.account_code));

      setBsData({ assets, liabilities, equity });
      setPlData({ revenues, expenses });
    }

    setIsLoading(false);
  };

  // 7月の場合のみ決算調整オプションを表示
  const [year, month] = selectedMonth.split('-');
  const isClosingMonth = month === '07';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">財務分析システム</h1>
        <p className="text-gray-600">財務諸表と詳細分析</p>
      </div>

      <div className="bg-gray-50 rounded-lg p-1 mb-6">
        <nav className="flex space-x-1">
          <button
            onClick={() => router.push('/finance/general-ledger')}
            className="flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>総勘定元帳</span>
          </button>
          <button
            className="flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium bg-white text-blue-600 shadow-sm"
          >
            <BarChart3 className="w-4 h-4" />
            <span>財務諸表</span>
          </button>
        </nav>
      </div>

      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-gray-400" />
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {/* 単月/通期累計切り替え */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowCumulative(!showCumulative)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                    showCumulative 
                      ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                      : 'bg-gray-100 text-gray-700 border border-gray-300'
                  }`}
                >
                  {showCumulative ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  <span className="text-sm font-medium">
                    {showCumulative ? '通期累計' : '単月'}
                  </span>
                </button>
                {showCumulative && (
                  <span className="text-xs text-gray-500">
                    {getFiscalYearStart(selectedMonth).substring(0, 7)} ～ {selectedMonth}
                  </span>
                )}
              </div>
            </div>
            
            {/* 7月の場合のみ決算調整オプションを表示 */}
            {isClosingMonth && (
              <div className="flex items-center space-x-2">
                <label className="flex items-center space-x-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={includeClosing}
                    onChange={(e) => setIncludeClosing(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>決算調整を含める</span>
                </label>
                {includeClosing && (
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                    決算調整適用中
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex border-b">
          {['bs', 'pl', 'cf', 'detail', 'report'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'bs' && '貸借対照表'}
              {tab === 'pl' && '損益計算書'}
              {tab === 'cf' && 'キャッシュフロー'}
              {tab === 'detail' && '詳細検索'}
              {tab === 'report' && (
                <span className="flex items-center space-x-1">
                  <FileText className="w-4 h-4" />
                  <span>決算書</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        {isLoading && activeTab !== 'detail' ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <>
            {activeTab === 'bs' && <BalanceSheet {...bsData} />}
            {activeTab === 'pl' && <ProfitLoss {...plData} showCumulative={showCumulative} />}
            {activeTab === 'cf' && (
              // 修正点：常に YYYY-MM の selectedMonth と includeClosing を渡す
              <CashFlow month={selectedMonth} includingClosing={includeClosing} />
            )}
            {activeTab === 'detail' && <DetailSearch selectedMonth={selectedMonth} />}
            {activeTab === 'report' && (
              <FinancialReport 
                bsData={bsData} 
                plData={plData} 
                selectedMonth={selectedMonth}
                includeClosing={includeClosing}
                showCumulative={showCumulative}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
