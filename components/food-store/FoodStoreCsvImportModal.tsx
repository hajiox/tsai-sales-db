// /components/food-store/FoodStoreCsvImportModal.tsx ver.14 (2025-08-19 JST)
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Papa from 'papaparse'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

interface FoodStoreCsvImportModalProps {
  isOpen?: boolean
  onClose?: () => void
  onImportComplete: () => void
  defaultYear?: number  // 追加
  defaultMonth?: number // 追加
}

export default function FoodStoreCsvImportModal({ 
  isOpen = false, 
  onClose = () => {}, 
  onImportComplete,
  defaultYear,  // 追加
  defaultMonth  // 追加
}: FoodStoreCsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [reportMonth, setReportMonth] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const supabase = getSupabaseBrowserClient()

  // モーダルが開いた時に年月を自動セット
  useEffect(() => {
    if (isOpen && defaultYear && defaultMonth) {
      const formattedMonth = `${defaultYear}-${String(defaultMonth).padStart(2, '0')}`
      setReportMonth(formattedMonth)
    }
  }, [isOpen, defaultYear, defaultMonth])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      setFile(selectedFile)
      setError(null)
      setSuccess(null)
    } else {
      setFile(null)
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

  // 安全な数値変換関数
  const safeParseInt = (value: any): number | null => {
    if (value === null || value === undefined || value === '') return null
    const parsed = parseInt(value)
    return isNaN(parsed) ? null : parsed
  }

  const safeParseFloat = (value: any): number | null => {
    if (value === null || value === undefined || value === '') return null
    const parsed = parseFloat(value)
    return isNaN(parsed) ? null : parsed
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
      // reportMonthを正しい形式に変換（YYYY-MM-DD形式）
      const formattedReportMonth = `${reportMonth}-01`
      
      // 商品マスターからカテゴリー情報を事前に取得
      const { data: productMasterData, error: fetchError } = await supabase
        .from('food_product_master')
        .select('jan_code, category_id')

      if (fetchError) {
        console.error('商品マスター取得エラー:', fetchError)
      }

      // カテゴリー情報をマップ化
      const categoryMap = new Map(
        productMasterData?.map(p => [p.jan_code, p.category_id]) || []
      )

      // CSVファイルをパース
      Papa.parse(file, {
        header: true,
        encoding: 'UTF-8',
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            // データが存在するか確認
            if (!results.data || results.data.length === 0) {
              setError('CSVファイルにデータが含まれていません')
              setIsImporting(false)
              return
            }

            // JANコードごとに集計
            const aggregatedMap = new Map()
            let validRowCount = 0
            let invalidRowCount = 0

            results.data.forEach((row: any) => {
              // JANコードの取得と検証
              const janCode = safeParseInt(row['ＪＡＮ'])
              
              // JANコードが無効な行はスキップ
              if (!janCode) {
                invalidRowCount++
                return
              }

              validRowCount++

              if (aggregatedMap.has(janCode)) {
                // 既存のデータに加算
                const existing = aggregatedMap.get(janCode)
                const quantity = safeParseInt(row['点数']) || 0
                const sales = safeParseInt(row['金額']) || 0
                const discount = safeParseInt(row['値引金額']) || 0
                const cost = safeParseInt(row['原価金額']) || 0
                const profit = safeParseInt(row['粗利']) || 0
                
                existing.quantity_sold = (existing.quantity_sold || 0) + quantity
                existing.total_sales = (existing.total_sales || 0) + sales
                existing.discount_amount = (existing.discount_amount || 0) + discount
                existing.cost_amount = (existing.cost_amount || 0) + cost
                existing.gross_profit = (existing.gross_profit || 0) + profit
                
                // 単価は最大値を使用
                const unitPrice = safeParseInt(row['単価'])
                if (unitPrice && (!existing.unit_price || unitPrice > existing.unit_price)) {
                  existing.unit_price = unitPrice
                }
              } else {
                // 新規追加（カテゴリー情報も設定）
                aggregatedMap.set(janCode, {
                  report_month: formattedReportMonth,
                  jan_code: janCode,
                  product_name: row['商品名'] || '',
                  supplier_code: safeParseInt(row['仕入先コード']),
                  supplier_name: row['仕入先名'] || null,
                  department_code: safeParseInt(row['部門コード']),
                  department_name: row['部門名'] || null,
                  rank: safeParseInt(row['順位']),
                  unit_price: safeParseInt(row['単価']),
                  quantity_sold: safeParseInt(row['点数']) || 0,
                  total_sales: safeParseInt(row['金額']) || 0,
                  discount_amount: safeParseInt(row['値引金額']) || 0,
                  cost_amount: safeParseInt(row['原価金額']) || 0,
                  gross_profit: safeParseInt(row['粗利']) || 0,
                  gross_profit_rate: safeParseFloat(row['粗利率']),
                  composition_ratio: safeParseFloat(row['構成比']),
                  cumulative_ratio: safeParseFloat(row['累計比']),
                  rank_category: row['ランク'] || null,
                  category_id: categoryMap.get(janCode) || null
                })
              }
            })

            // MapをArrayに変換
            const importData = Array.from(aggregatedMap.values())

            if (importData.length === 0) {
              setError('有効なデータが見つかりませんでした')
              setIsImporting(false)
              return
            }

            // 粗利率を再計算
            importData.forEach(item => {
              if (item.total_sales && item.total_sales > 0) {
                item.gross_profit_rate = parseFloat(((item.gross_profit / item.total_sales) * 100).toFixed(2))
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

            if (!response.ok) {
              throw new Error(result.error || result.details || 'インポートに失敗しました')
            }

            if (result.success) {
              // 新規商品のみ商品マスターに追加
              const newProducts = importData
                .filter(item => !categoryMap.has(item.jan_code))
                .map(item => ({
                  jan_code: item.jan_code,
                  product_name: item.product_name
                }))

              if (newProducts.length > 0) {
                const { error: upsertError } = await supabase
                  .from('food_product_master')
                  .upsert(newProducts, { 
                    onConflict: 'jan_code',
                    ignoreDuplicates: false 
                  })

                if (upsertError) {
                  console.error('商品マスター更新エラー:', upsertError)
                }
              }

              const message = invalidRowCount > 0 
                ? `${result.count}件のデータをインポートしました（${invalidRowCount}行スキップ）`
                : `${result.count}件のデータをインポートしました`
              
              setSuccess(message)
              
              // 成功後の処理
              onImportComplete()
              
              // 成功後3秒でダイアログを閉じる
              setTimeout(() => {
                handleClose()
              }, 3000)
            } else {
              setError(result.error || 'インポートに失敗しました')
            }
          } catch (err) {
            console.error('Import processing error:', err)
            setError(`処理エラー: ${err instanceof Error ? err.message : '不明なエラー'}`)
          } finally {
            setIsImporting(false)
          }
        },
        error: (error) => {
          console.error('CSV parse error:', error)
          setError(`CSVパースエラー: ${error.message}`)
          setIsImporting(false)
        }
      })
    } catch (err) {
      console.error('General error:', err)
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
            <div className="flex items-center gap-2">
              <Input
                id="reportMonth"
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                disabled={!!defaultYear && !!defaultMonth}  // 自動設定時は変更不可
              />
              {defaultYear && defaultMonth && (
                <span className="text-sm text-green-600">自動設定済み</span>
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="csvFile">CSVファイル（UTF-8）</Label>
            <Input
              id="csvFile"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
            />
            {file && (
              <p className="text-sm text-green-600">
                ファイル選択済み: {file.name}
              </p>
            )}
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
            <p>※ カテゴリーは商品マスターから自動設定されます</p>
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
