// /app/finance/general-ledger/page.tsx ver.2 (reverted)
'use client'

import { useState } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, Upload } from 'lucide-react'
import GeneralLedgerImportModal from '@/components/general-ledger/GeneralLedgerImportModal'

export default function GeneralLedgerPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  // ダミーのデータと日付
  const reportMonth = new Date('2025-02-01')
  const summary = { assets: 0, liabilities: 0, net_income: 0 }
  const balances: any[] = []

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">総勘定元帳</h2>
        <div className="flex items-center space-x-2">
          <Button
            variant={'outline'}
            className="w-[200px] justify-start text-left font-normal"
            disabled
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            2025年02月
          </Button>
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
                {balances.length > 0 ? (
                  balances.map((balance) => (
                    <tr key={balance.account_code}>
                      {/* データ表示部分 */}
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="p-4 text-center">データはありません。</td></tr>
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
          onSuccess={() => {
            // データ取得ロジックは削除
          }}
        />
      )}
    </div>
  )
}
