// /app/finance/general-ledger/page.tsx ver.20
'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Trash2, FileText, Calculator, Calendar, ChevronDown, ChevronRight, AlertCircle, BarChart3, FileSpreadsheet, DollarSign } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
  isComplete: boolean;
}

interface ClosingSummary {
  fiscal_year: number;
  fiscal_month: number;
  record_count: number;
  total_debit: number;
  total_credit: number;
}

export default function GeneralLedgerPage() {
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [yearGroups, setYearGroups] = useState<FiscalYearGroup[]>([]);
  const [closingData, setClosingData] = useState<ClosingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'monthly' | 'closing'>('monthly');
  const [viewMode, setViewMode] = useState<'year' | 'list'>('year');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isClosingImportModalOpen, setIsClosingImportModalOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  
  const router = useRouter();

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const getFiscalYear = (dateStr: string): number => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return month >= 8 ? year : year - 1;
  };

  const getFiscalYearLabel = (year: number): string => {
    const reiwaYear = year - 2018;
    const nextYear = year + 1;
    const nextReiwaYear = nextYear - 2018;
    return `${year}年度（令和${reiwaYear}年8月～令和${nextReiwaYear}年7月）`;
  };

  const getFiscalMonthOrder = (month: number): number => {
    return month >= 8 ? month - 7 : month + 5;
  };

  const fetchMonthlyData = async () => {
    try {
      setLoading(true);
      
      const { data: glData, error } = await supabase
        .from('gl_monthly_stats')
        .select('*')
        .order('report_month', { ascending: false });

      if (error) {
        console.error('Error fetching monthly stats:', error);
        return;
      }

      const { data: closingDataResult } = await supabase
        .from('closing_adjustments')
        .select('fiscal_year, fiscal_month, debit_amount, credit_amount');
      
      const closingSummaryMap = new Map<string, ClosingSummary>();
      if (closingDataResult) {
        closingDataResult.forEach(item => {
          const key = `${item.fiscal_year}-${item.fiscal_month}`;
          if (!closingSummaryMap.has(key)) {
            closingSummaryMap.set(key, {
              fiscal_year: item.fiscal_year,
              fiscal_month: item.fiscal_month,
              record_count: 0,
              total_debit: 0,
              total_credit: 0
            });
          }
          const summary = closingSummaryMap.get(key)!;
          summary.record_count++;
          summary.total_debit += item.debit_amount || 0;
          summary.total_credit += item.credit_amount || 0;
        });
      }
      
      setClosingData(Array.from(closingSummaryMap.values()));

      const formattedData: MonthlyData[] = (glData || []).map(item => ({
        yyyymm: item.yyyymm,
        report_month: item.report_month,
        account_count: item.account_count || 0,
        transaction_count: item.transaction_count || 0,
        total_debit: item.total_debit || 0,
        total_credit: item.total_credit || 0
      }));

      setMonthlyData(formattedData);

      const yearGroupsMap = new Map<number, MonthlyData[]>();
      
      formattedData.forEach(item => {
        const fiscalYear = getFiscalYear(item.report_month);
        if (!yearGroupsMap.has(fiscalYear)) {
          yearGroupsMap.set(fiscalYear, []);
        }
        yearGroupsMap.get(fiscalYear)!.push(item);
      });

      const groups: FiscalYearGroup[] = Array.from(yearGroupsMap.entries())
        .map(([year, months]) => {
          const sortedMonths = months.sort((a, b) => {
            const dateA = new Date(a.report_month);
            const dateB = new Date(b.report_month);
            const monthA = dateA.getMonth() + 1;
            const monthB = dateB.getMonth() + 1;
            
            const orderA = getFiscalMonthOrder(monthA);
            const orderB = getFiscalMonthOrder(monthB);
            
            return orderA - orderB;
          });

          const totals = sortedMonths.reduce((acc, month) => ({
            transaction_count: acc.transaction_count + month.transaction_count,
            total_debit: acc.total_debit + month.total_debit,
            total_credit: acc.total_credit + month.total_credit
          }), { transaction_count: 0, total_debit: 0, total_credit: 0 });

          const hasClosing = closingSummaryMap.has(`${year}-7`);

          const monthSet = new Set(sortedMonths.map(m => {
            const date = new Date(m.report_month);
            return date.getMonth() + 1;
          }));
          const isComplete = monthSet.size === 12;

          return {
            year,
            yearLabel: getFiscalYearLabel(year),
            months: sortedMonths,
            totals,
            hasClosing,
            isComplete
          };
        })
        .sort((a, b) => b.year - a.year);

      setYearGroups(groups);
      
      const latestYears = groups.slice(0, 2).map(g => g.year);
      setExpandedYears(new Set(latestYears));

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

  const getMissingMonths = (yearGroup: FiscalYearGroup): string[] => {
    const existingMonths = new Set(yearGroup.months.map(m => {
      const date = new Date(m.report_month);
      return date.getMonth() + 1;
    }));
    
    const missingMonths: string[] = [];
    const monthOrder = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];
    
    monthOrder.forEach(month => {
      if (!existingMonths.has(month)) {
        const yearForMonth = month >= 8 ? yearGroup.year : yearGroup.year + 1;
        missingMonths.push(`${yearForMonth}年${month}月`);
      }
    });
    
    return missingMonths;
  };

  // 最新の月を取得（財務諸表へのリンク用）
  const getLatestMonth = () => {
    if (monthlyData.length === 0) return null;
    return monthlyData[0].yyyymm;
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">データを読み込み中...</div>
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
            {monthlyData.length}ヶ月分
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            {monthlyData.reduce((sum, m) => sum + m.transaction_count, 0).toLocaleString()}件
          </span>
          <span className="flex items-center gap-1">
            <Calculator className="h-4 w-4" />
            {formatCurrency(monthlyData.reduce((sum, m) => sum + m.total_debit, 0))}
          </span>
        </div>
      </div>

      {/* 財務諸表へのナビゲーションボタン */}
      <div className="mb-4 p-4 bg-muted/30 rounded-lg">
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="default"
            className="gap-2"
            onClick={() => {
              const latestMonth = getLatestMonth();
              if (latestMonth) {
                const year = latestMonth.substring(0, 4);
                const month = latestMonth.substring(4, 6);
                router.push(`/finance/financial-statements?year=${year}&month=${month}`);
              } else {
                router.push('/finance/financial-statements');
              }
            }}
          >
            <BarChart3 className="h-4 w-4" />
            財務諸表
          </Button>
          
          <Button 
            variant="outline"
            className="gap-2"
            onClick={() => {
              const latestMonth = getLatestMonth();
              if (latestMonth) {
                const year = latestMonth.substring(0, 4);
                const month = latestMonth.substring(4, 6);
                router.push(`/finance/financial-statements?year=${year}&month=${month}&tab=balance-sheet`);
              }
            }}
          >
            <FileSpreadsheet className="h-4 w-4" />
            貸借対照表
          </Button>
          
          <Button 
            variant="outline"
            className="gap-2"
            onClick={() => {
              const latestMonth = getLatestMonth();
              if (latestMonth) {
                const year = latestMonth.substring(0, 4);
                const month = latestMonth.substring(4, 6);
                router.push(`/finance/financial-statements?year=${year}&month=${month}&tab=profit-loss`);
              }
            }}
          >
            <DollarSign className="h-4 w-4" />
            損益計算書
          </Button>
          
          <Button 
            variant="outline"
            className="gap-2"
            disabled
            title="実装準備中"
          >
            <Calculator className="h-4 w-4" />
            キャッシュフロー計算書
          </Button>
          
          {closingData.some(d => d.fiscal_month === 7) && (
            <Button 
              variant="outline"
              className="gap-2"
              onClick={() => {
                router.push('/finance/financial-statements?year=2024&month=07&tab=report');
              }}
            >
              <FileText className="h-4 w-4" />
              決算書作成
            </Button>
          )}
        </div>
      </div>

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

      {activeTab === 'monthly' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button onClick={() => setIsImportModalOpen(true)} className="gap-2">
                <Upload className="h-4 w-4" />
                CSVインポート
              </Button>
              <Select value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="year">年度別</SelectItem>
                  <SelectItem value="list">月次一覧</SelectItem>
                </SelectContent>
              </Select>
              {viewMode === 'year' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const allExpanded = yearGroups.every(g => expandedYears.has(g.year));
                    if (allExpanded) {
                      setExpandedYears(new Set());
                    } else {
                      setExpandedYears(new Set(yearGroups.map(g => g.year)));
                    }
                  }}
                >
                  {expandedYears.size === yearGroups.length ? '全て折りたたむ' : '全て展開'}
                </Button>
              )}
            </div>
          </div>

          {viewMode === 'year' && (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {yearGroups.map((yearGroup) => (
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
                        <CardTitle className="text-xl">{yearGroup.year}年度（7月決算）</CardTitle>
                        {yearGroup.isComplete && (
                          <span className="px-2 py-1 text-xs bg-green-500/10 text-green-600 rounded">
                            完全
                          </span>
                        )}
                        {yearGroup.hasClosing && (
                          <span className="px-2 py-1 text-xs bg-blue-500/10 text-blue-600 rounded">
                            決算済
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span>{yearGroup.months.length}/12ヶ月</span>
                        <span className="font-semibold">
                          {formatCurrency(yearGroup.totals.total_debit)}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  
                  {expandedYears.has(yearGroup.year) && (
                    <CardContent className="pt-0">
                      {!yearGroup.isComplete && (
                        <Alert className="mb-3">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            未登録月: {getMissingMonths(yearGroup).join('、')}
                          </AlertDescription>
                        </Alert>
                      )}
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
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex justify-between items-center font-semibold">
                          <span>年度合計</span>
                          <div className="flex gap-6">
                            <span>{yearGroup.totals.transaction_count.toLocaleString()}件</span>
                            <span>{formatCurrency(yearGroup.totals.total_debit)}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}

          {viewMode === 'list' && (
            <Card>
              <CardHeader>
                <CardTitle>月次データ一覧</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">対象月</th>
                        <th className="text-left py-2">年度</th>
                        <th className="text-right py-2">勘定科目数</th>
                        <th className="text-right py-2">取引件数</th>
                        <th className="text-right py-2">借方合計</th>
                        <th className="text-right py-2">貸方合計</th>
                        <th className="text-center py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map((month) => {
                        const fiscalYear = getFiscalYear(month.report_month);
                        return (
                          <tr key={month.yyyymm} className="border-b hover:bg-muted/30">
                            <td className="py-2">{formatMonth(month.yyyymm)}</td>
                            <td className="py-2">{fiscalYear}年度</td>
                            <td className="text-right py-2">{month.account_count}</td>
                            <td className="text-right py-2">{month.transaction_count.toLocaleString()}</td>
                            <td className="text-right py-2">{formatCurrency(month.total_debit)}</td>
                            <td className="text-right py-2">{formatCurrency(month.total_credit)}</td>
                            <td className="text-center py-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(month.yyyymm)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
                  {closingData.map((item) => (
                    <div key={`${item.fiscal_year}-${item.fiscal_month}`} 
                         className="flex items-center justify-between p-3 hover:bg-muted/30 rounded border">
                      <span className="font-medium">{item.fiscal_year}年度（7月決算）</span>
                      <div className="flex gap-4 items-center">
                        <span className="text-sm text-muted-foreground">
                          借方: {formatCurrency(item.total_debit)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          貸方: {formatCurrency(item.total_credit)}
                        </span>
                        <span className="px-2 py-1 text-sm bg-primary/10 text-primary rounded">
                          {item.record_count}件
                        </span>
                      </div>
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
