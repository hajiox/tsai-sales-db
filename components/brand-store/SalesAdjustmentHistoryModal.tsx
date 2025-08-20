// /components/brand-store/SalesAdjustmentHistoryModal.tsx ver.1
'use client'

import { useState, useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from '@/components/ui/use-toast'
import { Loader2, Trash2, Edit2, X, Check } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface AdjustmentData {
  id: string
  report_month: string
  adjustment_amount: number
  adjustment_reason: string | null
  created_at: string
}

interface SalesAdjustmentHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  selectedYear: number
  selectedMonth: number
  onUpdate: () => void
}

export function SalesAdjustmentHistoryModal({
  isOpen,
  onClose,
  selectedYear,
  selectedMonth,
  onUpdate
}: SalesAdjustmentHistoryModalProps) {
  const [adjustments, setAdjustments] = useState<AdjustmentData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState<string>('')
  const [editReason, setEditReason] = useState<string>('')
  const supabase = getSupabaseBrowserClient()

  // データ取得
  const fetchAdjustments = async () => {
    setIsLoading(true)
    try {
      const year = selectedYear
      const month = String(selectedMonth).padStart(2, '0')
      const reportMonth = `${year}-${month}-01`

      const { data, error } = await supabase
        .from('brand_store_sales_adjustments')
        .select('*')
        .eq('report_month', reportMonth)
        .order('created_at', { ascending: false })

      if (error) throw error
      setAdjustments(data || [])
    } catch (error) {
      console.error('Error fetching adjustments:', error)
      toast({
        title: 'エラー',
        description: '修正履歴の取得に失敗しました',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  // モーダルが開いたらデータ取得
  useEffect(() => {
    if (isOpen) {
      fetchAdjustments()
    }
  }, [isOpen, selectedYear, selectedMonth])

  // 編集開始
  const startEdit = (adjustment: AdjustmentData) => {
    setEditingId(adjustment.id)
    setEditAmount(adjustment.adjustment_amount.toString())
    setEditReason(adjustment.adjustment_reason || '')
  }

  // 編集キャンセル
  const cancelEdit = () => {
    setEditingId(null)
    setEditAmount('')
    setEditReason('')
  }

  // 編集保存
  const saveEdit = async (id: string) => {
    try {
      const amount = parseInt(editAmount.replace(/,/g, ''))
      if (isNaN(amount) || amount === 0) {
        toast({
          title: 'エラー',
          description: '有効な金額を入力してください',
          variant: 'destructive',
        })
        return
      }

      const { error } = await supabase
        .from('brand_store_sales_adjustments')
        .update({
          adjustment_amount: amount,
          adjustment_reason: editReason || null,
        })
        .eq('id', id)

      if (error) throw error

      toast({
        title: '成功',
        description: '修正データを更新しました',
      })

      fetchAdjustments()
      cancelEdit()
      onUpdate()
    } catch (error) {
      console.error('Error updating adjustment:', error)
      toast({
        title: 'エラー',
        description: '更新に失敗しました',
        variant: 'destructive',
      })
    }
  }

  // 削除
  const deleteAdjustment = async (id: string) => {
    if (!confirm('この修正データを削除してもよろしいですか？')) return

    try {
      const { error } = await supabase
        .from('brand_store_sales_adjustments')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast({
        title: '成功',
        description: '修正データを削除しました',
      })

      fetchAdjustments()
      onUpdate()
    } catch (error) {
      console.error('Error deleting adjustment:', error)
      toast({
        title: 'エラー',
        description: '削除に失敗しました',
        variant: 'destructive',
      })
    }
  }

  // 合計金額計算
  const totalAmount = adjustments.reduce((sum, adj) => sum + adj.adjustment_amount, 0)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>売上修正履歴</DialogTitle>
          <DialogDescription>
            {selectedYear}年{selectedMonth}月の売上修正履歴
            {adjustments.length > 0 && (
              <span className="ml-2 font-semibold">
                （合計: {formatCurrency(totalAmount)}）
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : adjustments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              修正データがありません
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>登録日時</TableHead>
                  <TableHead className="text-right">修正金額</TableHead>
                  <TableHead>修正理由</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((adjustment) => (
                  <TableRow key={adjustment.id}>
                    <TableCell>
                      {new Date(adjustment.created_at).toLocaleString('ja-JP')}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === adjustment.id ? (
                        <Input
                          type="text"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value.replace(/[^0-9-]/g, ''))}
                          className="w-32 text-right"
                        />
                      ) : (
                        <span className={adjustment.adjustment_amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {adjustment.adjustment_amount >= 0 ? '+' : ''}
                          {formatCurrency(adjustment.adjustment_amount)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === adjustment.id ? (
                        <Textarea
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          className="min-w-[200px]"
                          rows={1}
                        />
                      ) : (
                        <span className="text-sm">
                          {adjustment.adjustment_reason || '-'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === adjustment.id ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => saveEdit(adjustment.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelEdit}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(adjustment)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteAdjustment(adjustment.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-bold">合計</TableCell>
                  <TableCell className="text-right font-bold">
                    <span className={totalAmount >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {totalAmount >= 0 ? '+' : ''}
                      {formatCurrency(totalAmount)}
                    </span>
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
