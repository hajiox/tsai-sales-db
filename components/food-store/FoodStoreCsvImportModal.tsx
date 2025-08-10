// /components/food-store/FoodStoreCsvImportModal.tsx ver.6
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Papa from 'papaparse'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface FoodStoreCsvImportModalProps {
  onImportComplete: () => void
}

export default function FoodStoreCsvImportModal({ onImportComplete }: FoodStoreCsvImportModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [reportMonth, setReportMonth] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const supabase = createClientComponentClient()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
      setSuccess(null)
    }
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
      // 既存の商品マスターとカテゴリー情報を取得
      const { data: productMasterData, error: fetchError } = await supabase
        .from('food_product_master')
        .select('jan_code, category_id')
      
      if (fetchError) {
        console.error('商品マスター取得エラー:', fetchError)
      }

      // JANコードをキーとしたカテゴリーマップを作成
      const categoryMap = new Map()
      if (productMasterData) {
        productMasterData.forEach(product => {
          if (product.jan_code && product.category_id) {
            categoryMap.set(product.jan_code.toString(), product.category_id)
          }
        })
      }

      // CSVをパース
      Papa.parse(file, {
        header: true,
        encoding: 'Shift-JIS',
        complete: async (results) => {
          try {
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
                // 新規追加（カテゴリーIDも設定）
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
                  rank_category: row['ランク'] || '',
                  category_id: categoryMap.get(janCode.toString()) || null // カテゴリーIDを設定
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

            // 商品マスターを更新（新規商品のみ追加）
            const newProducts: any[] = []
            for (const item of importData) {
              // 既存の商品マスターにない場合のみ追加
              if (!categoryMap.has(item.jan_code.toString())) {
                newProducts.push({
                  jan_code: item.jan_code,
                  product_name: item.product_name,
                  category_id: null // 新規商品は未分類として登録
                })
              }
            }

            if (newProducts.length > 0) {
              const { error: upsertError } = await supabase
                .from('food_product_master')
                .upsert(newProducts, { onConflict: 'jan_code' })
              
              if (upsertError) {
                console.error('商品マスター更新エラー:', upsertError)
              }
            }

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
              setSuccess(`${result.count}件のデータをインポートしました${newProducts.length > 0 ? `（新規商品${newProducts.length}件を商品マスターに追加）` : ''}`)
              setFile(null)
              setReportMonth('')
              
              // 入力フィールドをリセット
              const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
              if (fileInput) fileInput.value = ''
              
              onImportComplete()
              
              // 成功後3秒でダイアログを閉じる
              setTimeout(() => {
                setIsOpen(false)
                setSuccess(null)
              }, 3000)
            } else {
              setError(result.error || 'インポートに失敗しました')
            }
          } catch (err) {
            setError(`処理エラー: ${err instanceof Error ? err.message : '不明なエラー'}`)
          } finally {
            setIsImporting(false)
          }
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700">
          CSVインポート
        </Button>
      </DialogTrigger>
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
            <p>※ 既に登録済みの商品カテゴリーは自動的に紐付けされます</p>
            <p>※ 新規商品は商品マスターに自動追加されます（カテゴリー未分類）</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
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
