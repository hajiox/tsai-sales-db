// /components/food-store/FoodStoreCsvImportModal.tsx ver.7
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Papa from 'papaparse'

interface FoodStoreCsvImportModalProps {
  isOpen?: boolean
  onClose?: () => void
  onImportComplete: () => void
}

export default function FoodStoreCsvImportModal({ 
  isOpen = false, 
  onClose = () => {}, 
  onImportComplete 
}: FoodStoreCsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [reportMonth, setReportMonth] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
      setSuccess(null)
    }
  }

  const handleClose = () => {
    // リセット処理
    setFile(null)
    setReportMonth('')
    setError(null)
    setSuccess(null)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    if (fileInput) fileInput.value = ''
    onClose()
  }

  const handleImport = async () => {
    if (!file || !reportMonth) {
      setError('ファイルとレポート月を指定してください')
      return
    }

    setIsImporting(true)
    setError(null)
    setSuccess(null)

    try {
      Papa.parse(file, {
        header: true,
        encoding: 'Shift-JIS',
        complete: async (results) => {
          // JANコードごとに集計
          const aggregatedMap = new Map()

          results.data.forEach((row: any) => {
            const janCode = parseInt(row['ＪＡＮ'])
            if (!janCode || isNaN(janCode)) return

            if (aggregatedMap.has(janCode)) {
              // 既存のデータに加算
              const existing = aggregatedMap.get(janCode)
              existing.quantity_sold += parseInt(row['点数'] || 0)
              existing.total_sales += parseInt(row['金額'] || 0)
              existing.discount_amount += parseInt(row['値引金額'] || 0)
              existing.cost_amount += parseInt(row['原価金額'] || 0)
              existing.gross_profit += parseInt(row['粗利'] || 0)
              
              // 単価は最大値を使用
              existing.unit_price = Math.max(existing.unit_price, parseInt(row['単価'] || 0))
            } else {
              // 新規追加
              aggregatedMap.set(janCode, {
                report_month: reportMonth,
                jan_code: janCode,
                product_name: row['商品名'] || '',
                supplier_code: parseInt(row['仕入先コード'] || 0),
                supplier_name: row['仕入先名'] || '',
                department_code: parseInt(row['部門コード'] || 0),
                department_name: row['部門名'] || '',
                rank: parseInt(row['順位'] || 0),
                unit_price: parseInt(row['単価'] || 0),
                quantity_sold: parseInt(row['点数'] || 0),
                total_sales: parseInt(row['金額'] || 0),
                discount_amount: parseInt(row['値引金額'] || 0),
                cost_amount: parseInt(row['原価金額'] || 0),
                gross_profit: parseInt(row['粗利'] || 0),
                gross_profit_rate: parseFloat(row['粗利率'] || 0),
                composition_ratio: parseFloat(row['構成比'] || 0),
                cumulative_ratio: parseFloat(row['累計比'] || 0),
                rank_category: row['ランク'] || ''
              })
            }
          })

          // MapをArrayに変換
          const importData = Array.from(aggregatedMap.values())

          // 粗利率を再計算
          importData.forEach(item => {
            if (item.total_sales > 0) {
              item.gross_profit_rate = (item.gross_profit / item.total_sales * 100).toFixed(2)
            }
          })

          // APIを呼び出してインポート
          const response = await fetch('/api/food-store/import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: importData }),
          })

          const result = await response.json()

          if (result.success) {
            setSuccess(`${result.count}件のデータをインポートしました`)
            
            // 成功後の処理
            onImportComplete()
            
            // 成功後3秒でダイアログを閉じる
            setTimeout(() => {
              handleClose()
            }, 3000)
          } else {
            setError(result.error || 'インポートに失敗しました')
          }
          
          setIsImporting(false)
        },
        error: (error) => {
          setError(`CSVパースエラー: ${error.message}`)
          setIsImporting(false)
        }
      })
    } catch (err) {
      setError(`エラーが発生しました: ${err instanceof Error ? err.message : '不明なエラー'}`)
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>食のブランド館 売上データインポート</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="reportMonth">レポート月</Label>
            <Input
              id="reportMonth"
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="csvFile">CSVファイル</Label>
            <Input
              id="csvFile"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="border-green-500 bg-green-50">
              <AlertDescription className="text-green-700">{success}</AlertDescription>
            </Alert>
          )}
          <div className="text-sm text-gray-500">
            <p>※ 同じJANコードの商品は自動的に合算されます</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || !reportMonth || isImporting}
          >
            {isImporting ? 'インポート中...' : 'インポート'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
