// /components/finance/FinancialStatementsContent.tsx ver.1
'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { FileSpreadsheet, BarChart3, Calendar } from 'lucide-react';
import { BalanceSheet } from '@/components/finance/BalanceSheet';
import { ProfitLoss } from '@/components/finance/ProfitLoss';
import { CashFlow } from '@/components/finance/CashFlow';
import { DetailSearch } from '@/components/finance/DetailSearch';
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
  const [activeTab, setActiveTab] = useState<'bs' | 'pl' | 'cf' | 'detail'>('bs');
  const [isLoading, setIsLoading] = useState(true);
  
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

  useEffect(() => {
    const authStatus = sessionStorage.getItem('financeSystemAuth');
    if (authStatus === 'authenticated') {
      loadFinancialData();
    } else {
      router.push('/finance/general-ledger');
    }
  }, [selectedMonth]);

  const loadFinancialData = async () => {
    setIsLoading(true);
    
    let allLedgerData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      
      const { data: ledgerData } = await supabase
        .from('general_ledger')
        .select(`
          account_code,
          debit_amount,
          credit_amount,
          account_master!inner(account_name)
        `)
        .eq('report_month', `${selectedMonth}-01`)
        .range(from, to);

      if (ledgerData && ledgerData.length > 0) {
        allLedgerData = [...allLedgerData, ...ledgerData];
        hasMore = ledgerData.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }

    if (allLedgerData.length > 0) {
      const accountTotals = new Map<string, { name: string, debit: number, credit: number }>();
      
      allLedgerData.forEach(item => {
        const code = item.account_code;
        const name = item.account_master?.account_name || '';
        
        if (!accountTotals.has(code)) {
          accountTotals.set(code, { name, debit: 0, credit: 0 });
        }
        
        const account = accountTotals.get(code)!;
        account.debit += item.debit_amount || 0;
        account.credit += item.credit_amount || 0;
      });

      const assets: AccountBalance[] = [];
      const liabilities: AccountBalance[] = [];
      const equity: AccountBalance[] = [];
      const revenues: AccountBalance[] = [];
      const expenses: AccountBalance[] = [];

      accountTotals.forEach((totals, code) => {
        let balance = 0;
        
        if ((code >= '100' && code < '200') || 
            (code >= '1000' && code < '1200') || 
            (code >= '400' && code < '600') || 
            code === '610') {
          balance = totals.debit - totals.credit;
        } else {
          balance = totals.credit - totals.debit;
        }

        const account: AccountBalance = {
          account_code: code,
          account_name: totals.name,
          balance: Math.abs(balance)
        };

        if ((code >= '100' && code < '200') || (code >= '1000' && code < '1200')) {
          assets.push(account);
        } else if ((code >= '200' && code < '300') || (code >= '1200' && code < '1300')) {
          liabilities.push(account);
        } else if (code >= '300' && code < '400') {
          equity.push(account);
        } else if ((code >= '800' && code < '900') || (code >= '600' && code < '610')) {
          revenues.push(account);
        } else if ((code >= '400' && code < '600') || code === '610') {
          expenses.push(account);
        }
      });

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
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <div className="flex border-b">
          {['bs', 'pl', 'cf', 'detail'].map((tab) => (
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
            {activeTab === 'pl' && <ProfitLoss {...plData} />}
            {activeTab === 'cf' && <CashFlow />}
            {activeTab === 'detail' && <DetailSearch selectedMonth={selectedMonth} />}
          </>
        )}
      </div>
    </div>
  );
}
