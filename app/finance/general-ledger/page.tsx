// /app/finance/general-ledger/page.tsx ver.16
'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Trash2, FileText, Calculator, Calendar, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import GeneralLedgerImportModal from '@/components/general-ledger/GeneralLedgerImportModal';
import ClosingImportModal from '@/components/general-ledger/ClosingImportModal';

interface MonthlyData {
  yyyymm: string;
  report_month: string;
  account_count: number;
  transaction_count: number;
  total_debit: number;
  total_credit: number;
}

interface FiscalYearGroup {
  year: number;
  yearLabel: string;
  months: MonthlyData[];
  totals: {
    transaction_count: number;
    total_debit: number;
    total_credit: number;
  };
  hasClosing?: boolean;
}

export default function GeneralLedgerPage() {
  const [monthlyData, setMonthlyData] = useState<FiscalYearGroup[]>([]);
  const [closingData, setClosingData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'monthly' | 'closing'>('monthly');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isClosingImportModalOpen, setIsClosingImportModalOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [stats, setStats] = useState({
    totalMonths: 0,
    totalTransactions: 0,
    totalAmount: 0,
    latestMonth: '',
    oldestMonth: ''
  });

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 会計年度の判定（4月始まり）
  const getFiscalYear = (dateStr: string): number => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return month >= 4 ? year : year - 1;
  };

  // 年度表示ラベル
  const getFiscalYearLabel = (year: number): string => {
    const reiwaYear = year - 2018;
    return `${year}年度（令和${reiwaYear}年度）`;
  };

  const fetchMonthlyData = async () => {
    try {
      setLoading(true);
      
      // APIから月次データ取得（制限なし）
      const response = await fetch('/api/general-ledger/months?limit=999');
      const apiData = await response.json();
      
      if (!apiData.success || !apiData.data) {
        console.error('Failed to fetch monthly data');
        return;
      }

      // 決算データ取得
      const { data: closingData } = await supabase
        .from('closing_adjustments')
        .select('fiscal_year, fiscal_month')
        .order('fiscal_year', { ascending: false });
      
      setClosingData(closingData || []);
      
      // 年度別にグループ化
      const yearGroups = new Map<number, MonthlyData[]>();
      let totalTransactions = 0;
      let totalAmount = 0;
      
      apiData.data.forEach((item: any) => {
        const fiscalYear = getFiscalYear(item.report_month);
        if (!yearGroups.has(fiscalYear)) {
          yearGroups.set(fiscalYear, []);
        }
        
        const monthData: MonthlyData = {
          yyyymm: item.yyyymm,
          report_month: item.report_month,
          account_count: item.account_count,
          transaction_count: item.transaction_count,
          total_debit: item.total_debit || 0,
          total_credit: item.total_credit || 0
        };
        
        yearGroups.get(fiscalYear)!.push(monthData);
        totalTransactions += monthData.transaction_count;
        totalAmount += monthData.total_debit;
      });

      // FiscalYearGroup配列に変換
      const groups: FiscalYearGroup[] = Array.from(yearGroups.entries())
        .map(([year, months]) => {
          // 月でソート（4月〜3月の順）
          const sortedMonths = months.sort((a, b) => {
            const dateA = new Date(a.report_month);
            const dateB = new Date(b.report_month);
            const monthA = dateA.getMonth() + 1;
            const monthB = dateB.getMonth() + 1;
            
            // 4月を先頭にする
            const fiscalMonthA = monthA >= 4 ? monthA - 4 : monthA + 8;
            const fiscalMonthB = monthB >= 4 ? monthB - 4 : monthB + 8;
            
            return fiscalMonthA - fiscalMonthB;
          });

          const totals = sortedMonths.reduce((acc, month) => ({
            transaction_count: acc.transaction_count + month.transaction_count,
            total_debit: acc.total_debit + month.total_debit,
            total_credit: acc.total_credit + month.total_credit
          }), { transaction_count: 0, total_debit: 0, total_credit: 0 });

          // 決算データの有無確認
          const hasClosing = closingData?.some(c => 
            c.fiscal_year === year && c.fiscal_month === 7
          );

          return {
            year,
            yearLabel: getFiscalYearLabel(year),
            months: sortedMonths,
            totals,
            hasClosing
          };
        })
        .sort((a, b) => b.year - a.year);

      setMonthlyData(groups);
      
      // 最新の3年度を展開
      const latestYears = groups.slice(0, 3).map(g => g.year);
      setExpandedYears(new Set(latestYears));

      // 統計情報
      const allMonths = apiData.data;
      if (allMonths.length > 0) {
        setStats({
          totalMonths: allMonths.length,
          totalTransactions,
          totalAmount,
          latestMonth: allMonths[0].yyyymm,
          oldestMonth: allMonths[allMonths.length - 1].yyyymm
        });
      }

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      const response = await fetch('/api/finance/auth', { method: 'GET' });
      const data = await response.json();
      setIsAuthenticated(data.authenticated);
      if (data.authenticated) {
        fetchMonthlyData();
      }
    };
    checkAuth();
  }, []);

  const handleAuth = async () => {
    const response = await fetch('/api/finance/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await response.json();
    if (data.success) {
      setIsAuthenticated(true);
      fetchMonthlyData();
    } else {
      alert('パスワードが正しくありません');
    }
  };

  const handleDelete = async (yyyymm: string) => {
    if (!confirm(`${yyyymm}のデータを削除してもよろしいですか？`)) return;
    
    const year = parseInt(yyyymm.substring(0, 4));
    const month = parseInt(yyyymm.substring(4, 6));
    const reportMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    
    const { error } = await supabase
      .from('general_ledger')
      .delete()
      .eq('report_month', reportMonth);
    
    if (!error) {
      await fetchMonthlyData();
    }
  };

  const toggleYear = (year: number) => {
    const newExpanded = new Set(expandedYears);
    if (newExpanded.has(year)) {
      newExpanded.delete(year);
    } else {
      newExpanded.add(year);
    }
    setExpandedYears(newExpanded);
  };

  const formatCurrency = (amount: number) => {
    return `¥ ${amount.toLocaleString()}`;
  };

  const formatMonth = (yyyymm: string) => {
    const year = yyyymm.substring(0, 4);
    const month = parseInt(yyyymm.substring(4, 6));
    return `${year}年${month}月`;
  };

  // フィルター後のデータ
  const filteredData = selectedYear === 'all' 
    ? monthlyData 
    : monthlyData.filter(g => g.year === parseInt(selectedYear));

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>認証が必要です</CardTitle>
          </CardHeader>
          <CardContent>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              className="w-full p-2 border rounded mb-4"
              placeholder="パスワードを入力"
            />
            <Button onClick={handleAuth} className="w-full">認証</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">総勘定元帳管理</h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {stats.totalMonths}ヶ月分
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            {stats.totalTransactions.toLocaleString()}件
          </span>
          <span className="flex items-center gap-1">
            <Calculator className="h-4 w-4" />
            {formatCurrency(stats.totalAmount)}
          </span>
        </div>
      </div>

      {/* タブ切り替えボタン */}
      <div className="flex gap-2 mb-4 border-b">
        <button
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'monthly' 
              ? 'border-b-2 border-primary text-primary' 
              : 'text-muted-foreground hover:text-primary'
          }`}
          onClick={() => setActiveTab('monthly')}
        >
          通常月データ
        </button>
        <button
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'closing' 
              ? 'border-b-2 border-primary text-primary' 
              : 'text-muted-foreground hover:text-primary'
          }`}
          onClick={() => setActiveTab('closing')}
        >
          決算データ
        </button>
      </div>

      {/* 通常月データタブ */}
      {activeTab === 'monthly' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button onClick={() => setIsImportModalOpen(true)} className="gap-2">
                <Upload className="h-4 w-4" />
                CSVインポート
              </Button>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="年度を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全年度</SelectItem>
                  {monthlyData.map(g => (
                    <SelectItem key={g.year} value={g.year.toString()}>
                      {g.yearLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => {
                  const allExpanded = filteredData.every(g => expandedYears.has(g.year));
                  if (allExpanded) {
                    setExpandedYears(new Set());
                  } else {
                    setExpandedYears(new Set(filteredData.map(g => g.year)));
                  }
                }}
              >
                {expandedYears.size === filteredData.length ? '全て折りたたむ' : '全て展開'}
              </Button>
            </div>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
            {filteredData.map((yearGroup) => (
              <Card key={yearGroup.year} className="overflow-hidden">
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleYear(yearGroup.year)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {expandedYears.has(yearGroup.year) ? 
                        <ChevronDown className="h-5 w-5" /> : 
                        <ChevronRight className="h-5 w-5" />
                      }
                      <CardTitle className="text-xl">{yearGroup.yearLabel}</CardTitle>
                      {yearGroup.hasClosing && (
                        <span className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded">
                          決算済
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span>{yearGroup.months.length}ヶ月</span>
                      <span className="font-semibold">
                        {formatCurrency(yearGroup.totals.total_debit)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                
                {expandedYears.has(yearGroup.year) && (
                  <CardContent className="pt-0">
                    <div className="space-y-1">
                      {yearGroup.months.map((month, idx) => (
                        <div key={month.yyyymm}>
                          {idx > 0 && <hr className="my-1" />}
                          <div className="flex items-center justify-between py-2 hover:bg-muted/30 px-2 rounded">
                            <div className="flex items-center gap-4">
                              <span className="font-medium w-24">
                                {formatMonth(month.yyyymm)}
                              </span>
                              <div className="flex gap-4 text-sm text-muted-foreground">
                                <span>{month.account_count}科目</span>
                                <span>{month.transaction_count.toLocaleString()}件</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-mono">
                                {formatCurrency(month.total_debit)}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(month.yyyymm);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 決算データタブ */}
      {activeTab === 'closing' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Button onClick={() => setIsClosingImportModalOpen(true)} className="gap-2">
              <Upload className="h-4 w-4" />
              決算CSVインポート
            </Button>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>決算調整データ</CardTitle>
            </CardHeader>
            <CardContent>
              {closingData.length > 0 ? (
                <div className="space-y-2">
                  {closingData.map((item: any) => (
                    <div key={`${item.fiscal_year}-${item.fiscal_month}`} 
                         className="flex items-center justify-between p-3 hover:bg-muted/30 rounded border">
                      <span className="font-medium">{item.fiscal_year}年度 決算調整</span>
                      <span className="px-2 py-1 text-sm bg-primary/10 text-primary rounded">
                        678件
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    決算データはまだインポートされていません
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {isImportModalOpen && (
        <GeneralLedgerImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportComplete={() => {
            fetchMonthlyData();
            setIsImportModalOpen(false);
          }}
        />
      )}
      
      {isClosingImportModalOpen && (
        <ClosingImportModal
          isOpen={isClosingImportModalOpen}
          onClose={() => setIsClosingImportModalOpen(false)}
          onImportComplete={() => {
            fetchMonthlyData();
            setIsClosingImportModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
