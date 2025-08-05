// /app/finance/general-ledger/page.tsx ver.3
'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar as CalendarIcon, Upload } from 'lucide-react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import GeneralLedgerImportModal from '@/components/general-ledger/GeneralLedgerImportModal'

// 型定義
type AccountBalance = {
  account_code: string
  account_name: string
  total_debit: number
  total_credit: number
  closing_balance: number
}

type SummaryData = {
  assets: number
  liabilities: number
  equity: number
  revenue: number
  expense: number
  net_income: number
}

export default function GeneralLedgerPage() {
  const supabase = createClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [reportMonth, setReportMonth] = useState<Date>(new Date('2025-02-01'))
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [summary, setSummary] = useState<SummaryData>({
    assets: 0,
    liabilities: 0,
    equity: 0,
    revenue: 0,
    expense: 0,
    net_income: 0,
  })
  const [loading, setLoading] = useState(true)

  const fetchAccountBalances = useCallback(async (date: Date) => {
    setLoading(true)
    const formattedMonth = format(date, 'yyyy-MM-01')

    const { data, error } = await supabase
      .from('monthly_account_balance')
      .select(`
        account_code,
        total_debit,
        total_credit,
        closing_balance,
        account_master (
          account_name
        )
      `)
      .eq('report_month', formattedMonth)
      .order('account_code', { ascending: true })

    if (error) {
      console.error('Error fetching account balances:', error)
      setBalances([])
    } else if (data) {
        const formattedData = data.map(item => ({
            ...item,
            // account_masterがnullまたは配列でない場合を考慮
            account_name: Array.isArray(item.account_master) ? item.account_master[0]?.account_name ?? '名称不明' : item.account_master?.account_name ?? '名称不明',
        }));
        setBalances(formattedData)
    }

    // ここでサマリーデータを計算（今回は仮の合計値）
    // 本来は勘定科目の特性に応じて資産・負債などを分類集計します
    const totalCredit = data?.reduce((sum, item) => sum + (item.total_credit ?? 0), 0) ?? 0
    const totalDebit = data?.reduce((sum, item) => sum + (item.total_debit ?? 0), 0) ?? 0
    setSummary({
        assets: totalDebit, // 仮
        liabilities: totalCredit, // 仮
        equity: 0, // 仮
        revenue: 0, // 仮
        expense: 0, // 仮
        net_income: totalDebit - totalCredit, // 仮
    })


    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchAccountBalances(reportMonth)
  }, [reportMonth, fetchAccountBalances])

  const handleMonthSelect = (date: Date | undefined) => {
    if (date) {
      setReportMonth(date)
    }
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">総勘定元帳</h2>
        <div className="flex items-center space-x-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={'outline'}
                className="w-[200px] justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(reportMonth, 'yyyy年MM月', { locale: ja })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={reportMonth}
                onSelect={handleMonthSelect}
                initialFocus
                captionLayout="dropdown-buttons"
                fromYear={2020}
                toYear={2030}
              />
            </PopoverContent>
          </Popover>
          <Button onClick={() => setIsModalOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> インポート
          </Button>
        </div>
      </div>

      {/* サマリーカード */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">資産合計</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{summary.assets.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">負債合計</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{summary.liabilities.toLocaleString()}</div>
          </CardContent>
        </Card>
        {/* 他のカードも同様に設定可能 */}
        <Card><CardHeader><CardTitle className="text-sm font-medium">純資産合計</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">¥0</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">収益合計</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">¥0</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">費用合計</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">¥0</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">当期純利益</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">¥{summary.net_income.toLocaleString()}</div></CardContent></Card>
      </div>

      {/* 勘定科目別残高 */}
      <Card>
        <CardHeader>
          <CardTitle>勘定科目別残高</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">勘定科目コード</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">勘定科目名</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">借方合計</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">貸方合計</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">残高</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr><td colSpan={5} className="p-4 text-center">読み込み中...</td></tr>
                ) : balances.length > 0 ? (
                  balances.map((balance) => (
                    <tr key={balance.account_code}>
                      <td className="whitespace-nowrap px-6 py-4">{balance.account_code}</td>
                      <td className="whitespace-nowrap px-6 py-4">{balance.account_name}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">{balance.total_debit.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">{balance.total_credit.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">{balance.closing_balance.toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="p-4 text-center">この月のデータはありません。</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      {isModalOpen && (
        <GeneralLedgerImportModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => fetchAccountBalances(reportMonth)}
        />
      )}
    </div>
  )
}
