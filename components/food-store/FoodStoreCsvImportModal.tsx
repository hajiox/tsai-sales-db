// /components/food-store/FoodStoreCsvImportModal.tsx ver.14
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

interface FoodStoreCsvImportModalProps {
  isOpen?: boolean
  onClose?: () => void
  onImportComplete: () => void
  defaultYear?: number
  defaultMonth?: number
}

export default function FoodStoreCsvImportModal({
  isOpen = false,
  onClose = () => {},
  onImportComplete,
  defaultYear,
  defaultMonth
}: FoodStoreCsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [reportMonth, setReportMonth] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    if (isOpen && defaultYear && defaultMonth) {
      const m = `${defaultYear}-${String(defaultMonth).padStart(2, '0')}`
      setReportMonth(m)
    }
  }, [isOpen, defaultYear, defaultMonth])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
      setSuccess(null)
    } else {
      setFile(null)
    }
  }

  const handleClose = () => {
    setFile(null)
    setReportMonth('')
    setError(null)
    setSuccess(null)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    if (fileInput) fileInput.value = ''
    onClose()
  }

  // ---------- helpers ----------
  const toDateMonth = (monthYYYYMM: string) => `${monthYYYYMM}-01`

  const digitsOnly = (v: any) => String(v ?? '').replace(/[^\d\-]/g, '') // マイナスも許容
  const cleanInt = (v: any): number | null => {
    const s = digitsOnly(v)
    if (s === '' || s === '-' || s === '--') return null
    const n = parseInt(s, 10)
    return Number.isNaN(n) ? null : n
  }
  const cleanFloat = (v: any): number | null => {
    const s = String(v ?? '').replace(/,/g, '')
    const n = parseFloat(s)
    return Number.isNaN(n) ? null : n
  }
  const normKey = (k: string) =>
    String(k || '')
      .replace(/\uFEFF/g, '')
      .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全角→半角
      .replace(/\s+/g, '')

  // サーバ側で正規化されたキー/元の日本語キーの双方に対応
  const getCol = (row: any, cands: string[], fallback?: any) => {
    for (const c of cands) {
      if (c in row) return row[c]
      const nk = normKey(c)
      const hit = Object.keys(row).find((k) => normKey(k) === nk)
      if (hit) return row[hit]
    }
    return fallback
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
      const formattedReportMonth = toDateMonth(reportMonth)

      // 商品マスター（カテゴリ自動付与用）
      const { data: productMasterData, error: fetchError } = await supabase
        .from('food_product_master')
        .select('jan_code, category_id')

      if (fetchError) {
        console.error('商品マスター取得エラー:', fetchError)
      }
      const categoryMap = new Map(productMasterData?.map((p) => [String(p.jan_code), p.category_id]) || [])

      // ① SJIS/UTF-8 どちらでもサーバ側で安全パース
      const fd = new FormData()
      fd.append('file', file)
      fd.append('report_month', formattedReportMonth)

      const parsedRes = await fetch('/api/food-store/import-sjis', { method: 'POST', body: fd })
      const parsed = await parsedRes.json()

      if (!parsedRes.ok || !parsed?.ok) {
        const detail = parsed?.detail ? ` / detail: ${JSON.stringify(parsed.detail)}` : ''
        throw new Error(parsed?.error || `SJIS/CSV解析に失敗しました${detail}`)
      }

      // ② 返ってきた raw rows をクライアントで集計（元の仕様を踏襲）
      const rows: any[] = parsed.data
      if (!rows || rows.length === 0) {
        setError('CSVファイルにデータが含まれていません')
        setIsImporting(false)
        return
      }

      // サーバが検出したJAN列名（正規化後）
      const serverJanCol: string | undefined = parsed?.stats?.jan_col

      // 列候補（和名／正規化想定）
      const COL = {
        jan: [serverJanCol || 'ＪＡＮ', 'JAN', 'JANコード', 'ＪＡＮコード', 'jan'],
        productName: ['商品名', '品名', 'product_name'],
        supplierCode: ['仕入先コード', 'supplier_code'],
        supplierName: ['仕入先名', 'supplier_name'],
        departmentCode: ['部門コード', 'department_code'],
        departmentName: ['部門名', 'department_name'],
        rank: ['順位', 'rank'],
        unitPrice: ['単価', 'unit_price'],
        quantity: ['点数', '数量', 'qty', 'quantity_sold'],
        sales: ['金額', '売上', '売上金額', 'total_sales'],
        discount: ['値引金額', '値引', 'discount_amount'],
        cost: ['原価金額', '原価', 'cost_amount'],
        profit: ['粗利', 'gross_profit'],
        gpRate: ['粗利率', 'gross_profit_rate'],
        compRatio: ['構成比', 'composition_ratio'],
        cumRatio: ['累計比', 'cumulative_ratio'],
        rankCat: ['ランク', 'rank_category'],
      }

      const aggregated = new Map<string, any>()
      let invalid = 0

      for (const row of rows) {
        const janRaw = getCol(row, COL.jan)
        const janDigits = digitsOnly(janRaw)
        // 8〜14桁以外はスキップ（サーバ側でも弾いているが二重防御）
        if (janDigits.length < 8 || janDigits.length > 14) {
          invalid++
          continue
        }
        const janKey = janDigits // 集計キーは数字のみ

        const quantity = cleanInt(getCol(row, COL.quantity)) || 0
        const sales = cleanInt(getCol(row, COL.sales)) || 0
        const discount = cleanInt(getCol(row, COL.discount)) || 0
        const cost = cleanInt(getCol(row, COL.cost)) || 0
        const profit = cleanInt(getCol(row, COL.profit)) || 0
        const unitPrice = cleanInt(getCol(row, COL.unitPrice))
        const obj = aggregated.get(janKey) || {
          report_month: formattedReportMonth,
          jan_code: janKey,
          product_name: String(getCol(row, COL.productName) ?? ''),
          supplier_code: cleanInt(getCol(row, COL.supplierCode)),
          supplier_name: getCol(row, COL.supplierName) ?? null,
          department_code: cleanInt(getCol(row, COL.departmentCode)),
          department_name: getCol(row, COL.departmentName) ?? null,
          rank: cleanInt(getCol(row, COL.rank)),
          unit_price: unitPrice ?? null,
          quantity_sold: 0,
          total_sales: 0,
          discount_amount: 0,
          cost_amount: 0,
          gross_profit: 0,
          gross_profit_rate: cleanFloat(getCol(row, COL.gpRate)),
          composition_ratio: cleanFloat(getCol(row, COL.compRatio)),
          cumulative_ratio: cleanFloat(getCol(row, COL.cumRatio)),
          rank_category: getCol(row, COL.rankCat) ?? null,
          category_id: null
        }

        obj.quantity_sold += quantity
        obj.total_sales += sales
        obj.discount_amount += discount
        obj.cost_amount += cost
        obj.gross_profit += profit
        if (unitPrice && (!obj.unit_price || unitPrice > obj.unit_price)) {
          obj.unit_price = unitPrice
        }

        // カテゴリ自動付与
        if (!obj.category_id && categoryMap.size > 0) {
          obj.category_id = categoryMap.get(janKey) ?? null
        }

        aggregated.set(janKey, obj)
      }

      const importData = Array.from(aggregated.values())

      if (importData.length === 0) {
        setError('有効なデータが見つかりませんでした')
        setIsImporting(false)
        return
      }

      // 粗利率の再計算
      importData.forEach((item) => {
        if (item.total_sales && item.total_sales > 0) {
          item.gross_profit_rate = parseFloat(((item.gross_profit / item.total_sales) * 100).toFixed(2))
        }
      })

      // ③ 既存API（DB登録）はそのまま
      const response = await fetch('/api/food-store/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 元実装踏襲：データに report_month を含めて送る
        body: JSON.stringify({ data: importData })
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result?.error || result?.details || 'インポートに失敗しました')
      }

      if (result?.success) {
        // 商品マスターへ新規品目を補完
        const newProducts = importData
          .filter((item) => !categoryMap.has(String(item.jan_code)))
          .map((item) => ({ jan_code: String(item.jan_code), product_name: String(item.product_name || '') }))

        if (newProducts.length > 0) {
          const { error: upsertError } = await supabase
            .from('food_product_master')
            .upsert(newProducts, { onConflict: 'jan_code', ignoreDuplicates: false })
          if (upsertError) console.error('商品マスター更新エラー:', upsertError)
        }

        const msg = invalid > 0
          ? `${result.count}件インポート（${invalid}行スキップ）`
          : `${result.count}件インポートしました`
        setSuccess(msg)
        onImportComplete()
        setTimeout(() => handleClose(), 3000)
      } else {
        setError(result?.error || 'インポートに失敗しました')
      }
    } catch (err: any) {
      console.error('Import error:', err)
      setError(`エラー: ${String(err?.message || err)}`)
    } finally {
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
                disabled={!!defaultYear && !!defaultMonth}
              />
              {defaultYear && defaultMonth && (
                <span className="text-sm text-green-600">自動設定済み</span>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="csvFile">CSVファイル（Shift_JIS / UTF-8）</Label>
            <Input id="csvFile" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
            {file && <p className="text-sm text-green-600">ファイル選択済み: {file.name}</p>}
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
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            キャンセル
          </Button>
          <Button onClick={handleImport} disabled={!file || !reportMonth || isImporting}>
            {isImporting ? 'インポート中...' : 'インポート'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
