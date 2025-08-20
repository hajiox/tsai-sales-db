// /components/brand-store/SalesAdjustmentModal.tsx ver.2
'use client'

import { useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/use-toast'
import { Loader2 } from 'lucide-react'

interface SalesAdjustmentModalProps {
  isOpen: boolean
  onClose: () => void
  selectedYear: number
  selectedMonth: number
  onSuccess: () => void
}

export function SalesAdjustmentModal({
  isOpen,
  onClose,
  selectedYear,
  selectedMonth,
  onSuccess
}: SalesAdjustmentModalProps) {
  const [adjustmentAmount, setAdjustmentAmount] = useState<string>('')
  const [adjustmentReason, setAdjustmentReason] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const supabase = getSupabaseBrowserClient()

  const handleSubmit = async () => {
    if (!adjustmentAmount || adjustmentAmount === '0') {
      toast({
        title: 'エラー',
        description: '修正金額を入力してください',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)

    try {
      const amount = parseInt(adjustmentAmount.replace(/,/g, ''))
      
      // 月の1日を確実に設定（月末日にならないように）
      const year = selectedYear
      const month = String(selectedMonth).padStart(2, '0')
      const reportMonth = `${year}-${month}-01`
      
      console.log('Saving adjustment for:', reportMonth, 'Amount:', amount)

      // 売上修正データを保存
      const { error } = await supabase
        .from('brand_store_sales_adjustments')
        .insert({
          report_month: reportMonth,
          adjustment_amount: amount,
          adjustment_reason: adjustmentReason || null,
        })

      if (error) {
        throw error
      }

      toast({
        title: '成功',
        description: `売上修正を登録しました（${amount > 0 ? '+' : ''}${amount.toLocaleString()}円）`,
      })

      // フォームをリセット
      setAdjustmentAmount('')
      setAdjustmentReason('')
      
      // 親コンポーネントを更新
      onSuccess()
      onClose()
    } catch (error) {
      console.error('Error saving adjustment:', error)
      toast({
        title: 'エラー',
        description: '売上修正の登録に失敗しました',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9-]/g, '')
    setAdjustmentAmount(value)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>売上修正</DialogTitle>
          <DialogDescription>
            {selectedYear}年{selectedMonth}月の売上を修正します。
            プラスの金額で加算、マイナスの金額で減算されます。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="amount">修正金額（円）</Label>
            <Input
              id="amount"
              type="text"
              placeholder="例: 1000 または -1000"
              value={adjustmentAmount}
              onChange={handleAmountChange}
              disabled={isLoading}
            />
            <p className="text-sm text-muted-foreground">
              加算する場合は正の数、減算する場合は負の数を入力
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reason">修正理由（任意）</Label>
            <Textarea
              id="reason"
              placeholder="例: レジ単価修正による差額調整"
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              disabled={isLoading}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || !adjustmentAmount || adjustmentAmount === '0'}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            修正を登録
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
