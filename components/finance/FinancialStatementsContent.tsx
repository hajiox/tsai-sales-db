// /components/finance/FinancialStatementsContent.tsx  ver.8
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import getSupabase from '@/lib/supabase/browser'; // ver.9 (2025-08-19 JST) - browser singleton client
import { FileSpreadsheet, BarChart3, Calendar, FileText, ToggleLeft, ToggleRight } from 'lucide-react';

import { BalanceSheet } from '@/components/finance/BalanceSheet';
import { ProfitLoss } from '@/components/finance/ProfitLoss';
import { CashFlow } from '@/components/finance/CashFlow';
import { DetailSearch } from '@/components/finance/DetailSearch';
import { FinancialReport } from '@/components/finance/FinancialReport';

export interface AccountBalance {
  account_code: string;
  account_name: string;
  balance: number;
}

type Tab = 'bs' | 'pl' | 'cf' | 'detail' | 'report';

export default function FinancialStatementsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const getInitialMonth = () => {
    const m = searchParams.get('month');
    if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return m;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedMonth, setSelectedMonth] = useState<string>(getInitialMonth());
  const [activeTab, setActiveTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'bs');
  const [includeClosing, setIncludeClosing] = useState(false); // 7月のみ適用（PL/CF）
  const [showCumulative, setShowCumulative] = useState(false); // PLのみ
  const [loading, setLoading] = useState(true);

  const [bsData, setBsData] = useState<{ assets: AccountBalance[]; liabilities: AccountBalance[]; equity: AccountBalance[]; }>({
    assets: [], liabilities: [], equity: []
  });
  const [plData, setPlData] = useState<{ revenues: AccountBalance[]; expenses: AccountBalance[]; }>({
    revenues: [], expenses: []
  });

  const supabase = useMemo(
    () => (typeof window !== 'undefined' ? getSupabase() : null),
    []
  );

  const pushMonthToUrl = (m: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', m);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const getFiscalYearStart = (month: string) => {
    const [y, mm] = month.split('-').map(Number);
    const fiscalYear = mm >= 8 ? y : y - 1;
    return `${fiscalYear}-08-01`;
  };

  useEffect(() => {
    const auth = sessionStorage.getItem('financeSystemAuth');
    if (auth !== 'authenticated') {
      router.push('/finance/general-ledger');
      return;
    }
    loadFinancialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const auth = sessionStorage.getItem('financeSystemAuth');
    if (auth === 'authenticated') {
      loadFinancialData();
      pushMonthToUrl(selectedMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, includeClosing, showCumulative]);

  /** ===== BS: ビューから取得（JOIN済み） ===== */
  const fetchBalanceSheet = async (month: string) => {
    if (!supabase) return { assets: [], liabilities: [], equity: [] };
    const monthStart = `${month}-01`;
    const { data, error } = await supabase
      .from('v_monthly_balance_with_type')
      .select('account_code, account_name, account_type, closing_balance')
      .eq('report_month', monthStart);

    if (error) {
      console.error('BS残高取得エラー:', error);
      return { assets: [], liabilities: [], equity: [] };
    }
    if (!data || data.length === 0) {
      console.warn('BS残高：0件（RLS/権限 or 期間不一致の可能性）');
      return { assets: [], liabilities: [], equity: [] };
    }

    // ←★ ここが修正ポイント：未分類/空欄は account_code の番号帯で補正
    const resolveType = (codeStr: string, rawType?: string | null) => {
      const t = (rawType || '').trim();
      if (t === '資産' || t === '負債' || t === '純資産') return t;
      const n = parseInt(codeStr, 10);
      if (Number.isNaN(n)) return '未分類';
      if ((n >= 100 && n < 200) || (n >= 1000 && n < 1200)) return '資産';
      if ((n >= 200 && n < 300) || (n >= 1200 && n < 1300)) return '負債';
      if (n >= 300 && n < 400) return '純資産';
      return '未分類';
    };

    const assets: AccountBalance[] = [];
    const liabilities: AccountBalance[] = [];
    const equity: AccountBalance[] = [];

    data.forEach((row: any) => {
      const type = resolveType(row.account_code, row.account_type);
      const name = (row.account_name || '').toString();
      const bal = Number(row.closing_balance) || 0;
      if (!name) return;

      const acc: AccountBalance = { account_code: row.account_code, account_name: name, balance: bal };

      if (type === '資産') assets.push(acc);
      else if (type === '負債') liabilities.push(acc);
      else if (type === '純資産') equity.push(acc);
      // 未分類はB/Sに載せない（必要なら別枠で表示可）
    });

    const byCode = (a: AccountBalance, b: AccountBalance) => a.account_code.localeCompare(b.account_code);
    assets.sort(byCode); liabilities.sort(byCode); equity.sort(byCode);

    return { assets, liabilities, equity };
  };

  /** ===== PL: 既存ロジック（元帳集計＋決算調整） ===== */
  const fetchProfitLoss = async (month: string, cumulative: boolean, withClosing: boolean) => {
    if (!supabase) return { revenues: [], expenses: [] };
    const dateCond = cumulative ? { gte: getFiscalYearStart(month), lte: `${month}-01` } : { eq: `${month}-01` };

    let all: any[] = [];
    const limit = 1000;
    let from = 0;

    while (true) {
      let query = supabase
        .from('general_ledger')
        .select('account_code, debit_amount, credit_amount, account_master(account_name, account_type)')
        .range(from, from + limit - 1);

      if ('gte' in dateCond) query = query.gte('report_month', dateCond.gte).lte('report_month', dateCond.lte);
      else query = query.eq('report_month', dateCond.eq);

      const { data, error } = await query;
      if (error) { console.error('PL元帳取得エラー:', error); break; }
      if (!data || data.length === 0) break;

      all = all.concat(data);
      if (data.length < limit) break;
      from += limit;
    }

    const monthMM = month.slice(5, 7);
    const yearYY = Number(month.slice(0, 4));
    const isClosingMonth = monthMM === '07';

    let merged = all.slice();
    if (withClosing && isClosingMonth) {
      const { data: closing } = await supabase.from('closing_adjustments').select('*').eq('fiscal_year', yearYY);
      if (closing?.length) {
        const typeByCode = (code: string): string => {
          const n = parseInt(code, 10);
          if ((n >= 100 && n < 200) || (n >= 1000 && n < 1200)) return '資産';
          if ((n >= 200 && n < 300) || (n >= 1200 && n < 1300)) return '負債';
          if (n >= 300 && n < 400) return '純資産';
          if (n >= 800 && n < 900) return '収益';
          if (n >= 600 && n < 610) return '営業外収益';
          if (n === 610) return '営業外費用';
          if (n >= 400 && n < 600) return '費用';
          return '未分類';
        };
        merged = merged.concat(
          closing.map((c: any) => ({
            account_code: c.account_code,
            debit_amount: c.debit_amount,
            credit_amount: c.credit_amount,
            account_master: { account_name: c.account_name || '', account_type: typeByCode(c.account_code) }
          }))
        );
      }
    }

    const totals = new Map<string, { name: string; type: string; debit: number; credit: number }>();
    merged.forEach((row: any) => {
      const code = row.account_code;
      const name = row.account_master?.account_name || '';
      const type = row.account_master?.account_type || '未分類';
      if (!totals.has(code)) totals.set(code, { name, type, debit: 0, credit: 0 });
      const t = totals.get(code)!;
      t.debit += row.debit_amount || 0;
      t.credit += row.credit_amount || 0;
    });

    const revenues: AccountBalance[] = [];
    const expenses: AccountBalance[] = [];
    totals.forEach((v, code) => {
      const isRevenue = v.type === '収益' || v.type === '営業外収益';
      const isExpense = v.type === '費用' || v.type === '営業外費用';
      if (!isRevenue && !isExpense) return;

      const balance = isExpense ? (v.debit || 0) - (v.credit || 0) : (v.credit || 0) - (v.debit || 0);
      const acc: AccountBalance = { account_code: code, account_name: v.name, balance: Math.max(0, balance) };
      if (isRevenue) revenues.push(acc); else expenses.push(acc);
    });

    const byCode = (a: AccountBalance, b: AccountBalance) => a.account_code.localeCompare(b.account_code);
    revenues.sort(byCode); expenses.sort(byCode);
    return { revenues, expenses };
  };

  const loadFinancialData = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const [bs, pl] = await Promise.all([
        fetchBalanceSheet(selectedMonth),
        fetchProfitLoss(selectedMonth, showCumulative, includeClosing)
      ]);
      setBsData(bs);
      setPlData(pl);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const isClosingMonth = useMemo(() => selectedMonth.slice(5, 7) === '07', [selectedMonth]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">財務分析システム</h1>
        <p className="text-gray-600">財務諸表と詳細分析</p>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-500" />
              <input type="month" className="px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            </div>

            <button
              onClick={() => setShowCumulative((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border ${showCumulative ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
              title="損益計算書にのみ適用（貸借対照表には影響しません）"
            >
              {showCumulative ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              <span className="text-sm font-medium">{showCumulative ? '通期累計（PL）' : '単月（PL）'}</span>
              {showCumulative && (<span className="text-xs text-blue-600">{getFiscalYearStart(selectedMonth).slice(0, 7)} ～ {selectedMonth}</span>)}
            </button>
          </div>

          {isClosingMonth && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeClosing} onChange={(e) => setIncludeClosing(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span>決算調整を含める（損益/CF）</span>
            </label>
          )}
        </div>

        <div className="mt-4 border-b flex gap-6">
          <TabBtn id="bs" label="貸借対照表" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabBtn id="pl" label="損益計算書" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabBtn id="cf" label="キャッシュフロー" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabBtn id="detail" label="詳細検索" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabBtn id="report" label={<span className="flex items-center gap-1"><FileText className="w-4 h-4" /> 決算書</span>} activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">読み込み中...</div>
      ) : (
        <div className="min-h-[420px]">
          {activeTab === 'bs' && <BalanceSheet {...bsData} />}
          {activeTab === 'pl' && (<ProfitLoss {...plData} showCumulative={showCumulative} selectedMonth={selectedMonth} />)}
          {activeTab === 'cf' && (<CashFlow month={selectedMonth} includingClosing={includeClosing} />)}
          {activeTab === 'detail' && (<DetailSearch month={selectedMonth} />)}
          {activeTab === 'report' && (<FinancialReport bsData={bsData} plData={plData} selectedMonth={selectedMonth} includeClosing={includeClosing} showCumulative={showCumulative} />)}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button className="px-3 py-2 rounded-md bg-blue-600 text-white flex items-center gap-2" onClick={() => router.push('/finance/general-ledger')}>
          <FileSpreadsheet className="w-4 h-4" /> 総勘定元帳へ
        </button>
        <button className="px-3 py-2 rounded-md bg-gray-100 text-gray-800 flex items-center gap-2" onClick={() => setActiveTab('bs')}>
          <BarChart3 className="w-4 h-4" /> 財務諸表トップ
        </button>
      </div>
    </div>
  );
}

function TabBtn({ id, label, activeTab, setActiveTab }: { id: Tab; label: string | JSX.Element; activeTab: Tab; setActiveTab: (t: Tab) => void; }) {
  const active = activeTab === id;
  return (
    <button
      onClick={() => setActiveTab(id)}
      className={`py-3 -mb-px border-b-2 text-sm font-medium transition ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
    >
      {label}
    </button>
  );
}
