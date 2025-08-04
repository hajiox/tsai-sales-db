// /components/food-store/FoodStoreCsvImportModal.tsx ver.4
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Upload, FileSpreadsheet } from 'lucide-react'
import Papa from 'papaparse'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface FoodStoreCsvImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
  selectedYear: number
  selectedMonth: number
}

export function FoodStoreCsvImportModal({ 
  isOpen, 
  onClose, 
  onImportComplete,
  selectedYear,
  selectedMonth 
}: FoodStoreCsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClientComponentClient()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
    }
  }

  const handleImport = async () => {
    if (!file) return

    setImporting(true)
    setError(null)

    try {
      const text = await file.text()
      
      Papa.parse(text, {
        header: true,
        encoding: 'UTF-8',
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const reportMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
            
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
                
                // 単価は加重平均を計算（簡易的に最大値を使用）
                existing.unit_price = Math.max(existing.unit_price, parseInt(row['単価'] || 0))
              } else {
                // 新規追加
                aggregatedMap.set(janCode, {
                  report_month: reportMonth,
                  jan_code: janCode,
                  product_name: row['商品名'] || '',
                  supplier_code: parseInt(row['仕入先コード']) || null,
                  supplier_name: row['仕入先名'] || null,
                  department_code: parseInt(row['部門コード']) || null,
                  department_name: row['部門名'] || null,
                  rank: parseInt(row['順位']) || null,
                  unit_price: parseInt(row['単価']) || null,
                  quantity_sold: parseInt(row['点数'] || 0),
                  total_sales: parseInt(row['金額'] || 0),
                  discount_amount: parseInt(row['値引金額'] || 0),
                  cost_amount: parseInt(row['原価金額'] || 0),
                  gross_profit: parseInt(row['粗利'] || 0),
                  gross_profit_rate: parseFloat(row['粗利率']) || null,
                  composition_ratio: parseFloat(row['構成比']) || null,
                  cumulative_ratio: parseFloat(row['累計比']) || null,
                  rank_category: row['ランク'] || null
                })
              }
            })

            const importData = Array.from(aggregatedMap.values())

            // 粗利率を再計算
            importData.forEach(item => {
              if (item.total_sales > 0) {
                item.gross_profit_rate = (item.gross_profit / item.total_sales * 100).toFixed(2)
              }
            })

            // 既存データを削除
            const { error: deleteError } = await supabase
              .from('food_store_sales')
              .delete()
              .eq('report_month', reportMonth)

            if (deleteError) throw deleteError

            // 新しいデータを挿入
            const { error: insertError } = await supabase
              .from('food_store_sales')
              .insert(importData)

            if (insertError) throw insertError

            // 商品マスターの更新
            const productMasterData = importData.map(item => ({
              jan_code: item.jan_code,
              product_name: item.product_name
            }))

            const { error: upsertError } = await supabase
              .from('food_product_master')
              .upsert(productMasterData, { 
                onConflict: 'jan_code',
                ignoreDuplicates: false 
              })

            if (upsertError) throw upsertError

            alert(`${importData.length}件のデータをインポートしました`)
            onImportComplete()
          } catch (err) {
            console.error('Import error:', err)
            setError('データのインポートに失敗しました: ' + (err as Error).message)
          }
        },
        error: (err) => {
          setError('CSVの解析に失敗しました: ' + err.message)
        }
      })
    } catch (err) {
      setError('ファイルの読み込みに失敗しました')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>食のブランド館 販売データインポート</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            {selectedYear}年{selectedMonth}月のデータをインポートします
          </div>
          
          <div className="border-2 border-dashed rounded-lg p-6">
            <div className="text-center">
              <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400" />
              <div className="mt-2">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-sm text-blue-600 hover:text-blue-500">
                    CSVファイルを選択
                  </span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    accept=".csv"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
              {file && (
                <p className="mt-2 text-sm text-gray-600">
                  選択: {file.name}
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={!file || importing}
            >
              {importing ? (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-spin" />
                  インポート中...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  インポート
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
