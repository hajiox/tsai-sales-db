// /components/web-sales-editable-table.tsx ver.44 (onSuccess修正版)
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
// useDisclosureを削除

// Custom Hooks
import { useWebSalesData } from "@/hooks/useWebSalesData"
import { useCSVImport } from "@/hooks/useCSVImport"
import { useTableEdit } from "@/hooks/useTableEdit"

// Components
import WebSalesTableHeader from "./WebSalesTableHeader"
import WebSalesDataTable from "./WebSalesDataTable"
import WebSalesImportButtons from "./WebSalesImportButtons"
import WebSalesSummary from "./WebSalesSummary"
import CsvImportConfirmModal from "./CsvImportConfirmModal"
import AmazonCsvImportModal from "./AmazonCsvImportModal"
import AmazonCsvConfirmModal from "./AmazonCsvConfirmModal"

// Utils
import { 
  calculateTotalAllECSites,
  sortWebSalesData,
  filterWebSalesData
} from "@/utils/webSalesUtils"

// Types
import { WebSalesData } from "@/types/db"

interface WebSalesEditableTableProps {
  initialWebSalesData: WebSalesData[]
  month: string
}

export default function WebSalesEditableTable({
  initialWebSalesData,
  month,
}: WebSalesEditableTableProps) {
  const [filterValue, setFilterValue] = useState("")

  // Amazon CSV関連のstate
  const [amazonResults, setAmazonResults] = useState<any>(null)
  const [showAmazonConfirm, setShowAmazonConfirm] = useState(false)
  const [isAmazonSubmitting, setIsAmazonSubmitting] = useState(false)

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Custom Hooks
  const {
    data,
    setData,
    productMap,
    isLoading: dataLoading,
    getProductName,
    getProductSeriesCode,
    getProductNumber,
    getProductPrice,
    handleDeleteMonthData,
  } = useWebSalesData(initialWebSalesData, month)

  const {
    importResults,
    productMaster,
    setProductMaster,
    isSubmittingImport,
    isUploading,
    fileInputRef,
    isCsvModalOpen,
    onOpenCsvModal,
    onCloseCsvModal,
    handleCsvButtonClick,
    handleFileSelect,
    handleImportResultChange,
    handleConfirmImport,
  } = useCSVImport()

  const {
    editMode,
    editedValue,
    isLoading: editLoading,
    setEditedValue,
    handleEdit,
    handleSave,
    handleCancel,
  } = useTableEdit()

  // Amazon CSV Modal (useDisclosureを使わずにシンプルなstateで管理)
  const [isAmazonCsvModalOpen, setIsAmazonCsvModalOpen] = useState(false)
  
  const onOpenAmazonCsvModal = () => setIsAmazonCsvModalOpen(true)
  const onCloseAmazonCsvModal = () => setIsAmazonCsvModalOpen(false)

  // Set product master for CSV import - 安全な依存関係
  useEffect(() => {
    if (productMap && productMap.size > 0) {
      const products = Array.from(productMap.values())
      const masterData = products.map(p => ({ id: p.id, name: p.name }))
      setProductMaster(masterData)
    }
  }, [productMap.size]) // sizeのみを監視

  // 月変更処理 - 循環参照を避ける
  const handleMonthChange = (selectedMonth: string) => {
    const params = new URLSearchParams()
    params.set("month", selectedMonth)
    router.push(`${pathname}?${params.toString()}`)
  }

  // フィルタリングとソート - 安定した依存関係
  const filteredItems = useMemo(() => {
    if (!data || data.length === 0) return []
    const sortedData = sortWebSalesData(data, getProductSeriesCode, getProductNumber)
    return filterWebSalesData(sortedData, filterValue, getProductName)
  }, [data, filterValue]) // 最小限の依存関係

  // 合計計算 - 安定した依存関係
  const totalCount = useMemo(() => {
    return calculateTotalAllECSites(filteredItems)
  }, [filteredItems])
  
  const totalAmount = useMemo(() => {
    let sum = 0
    filteredItems.forEach(item => {
      const productPrice = getProductPrice(item.product_id) || 0
      const totalItemQuantity = [
        "amazon", "rakuten", "yahoo", "mercari", "base", "qoo10"
      ].reduce((total, site) => total + (item[`${site}_count`] || 0), 0)
      sum += totalItemQuantity * productPrice
    })
    return sum
  }, [filteredItems]) // getProductPriceを依存関係から除外

  // 保存処理 - 安定化
  const handleSaveWithDeps = (productId: string, ecSite: string) => {
    handleSave(productId, ecSite, month, data, setData, getProductPrice)
  }

  // ファイル選択処理 - 安定化
  const handleFileSelectWithMonth = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e, month)
  }

  // インポート確認処理 - 安定化
  const handleConfirmImportWithMonth = (updatedResults: any[]) => {
    handleConfirmImport(updatedResults, month)
  }

  // 削除処理 - 安定化
  const handleDeleteWithRouter = () => {
    handleDeleteMonthData(month, router)
  }

  // Amazon CSV成功時の処理
  const handleAmazonCsvSuccess = (results: any) => {
    console.log('Amazon CSV結果:', results)
    console.log('現在の月:', month) // デバッグ用
    setAmazonResults(results)
    setShowAmazonConfirm(true)
    onCloseAmazonCsvModal()
  }

  // Amazon CSV確認モーダルを閉じる
  const handleAmazonConfirmClose = () => {
    setShowAmazonConfirm(false)
    setAmazonResults(null)
  }

  // Amazon CSV確定処理
  const handleAmazonConfirm = async (updatedResults: any[]) => {
    setIsAmazonSubmitting(true)
    try {
      // 月の形式を確認・修正
      const formattedMonth = month.length === 7 ? month : `${month.slice(0,4)}-${month.slice(4,6)}`
      console.log('Amazon確定処理開始:', { 
        originalMonth: month, 
        formattedMonth, 
        resultsCount: updatedResults.length 
      })
      
      const response = await fetch('/api/import/amazon-confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          month: formattedMonth, // 修正された月を使用
          results: updatedResults,
        }),
      })

      let result
      try {
        result = await response.json()
      } catch (parseError) {
        console.error('レスポンス解析エラー:', parseError)
        throw new Error('サーバーからの応答を解析できませんでした')
      }

      if (!response.ok) {
        console.error('レスポンスエラー:', { status: response.status, result })
        throw new Error(result?.error || `サーバーエラー (${response.status})`)
      }

      console.log('Amazon データ更新成功:', result)
      
      // 成功メッセージ（より詳細な条件判定）
      const successCount = result.successCount || 0
      const errorCount = result.errorCount || 0
      const totalCount = result.totalCount || 0
      
      console.log('成功判定:', { successCount, errorCount, totalCount })
      
      if (successCount > 0 || totalCount > 0) {
        alert(`Amazon データの更新が完了しました\n成功: ${successCount}件${errorCount > 0 ? `\nエラー: ${errorCount}件` : ''}\n合計: ${totalCount}件`)
      } else {
        alert('更新できるデータがありませんでした')
      }
      
      // モーダルを閉じる
      handleAmazonConfirmClose()
      
      // 少し遅延してからリロード
      setTimeout(() => {
        window.location.reload()
      }, 1000)
      
    } catch (error) {
      console.error('Amazon データ更新エラー:', error)
      const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました'
      alert(`データの更新に失敗しました:\n${errorMessage}`)
    } finally {
      setIsAmazonSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelectWithMonth} 
        style={{ display: 'none' }} 
        accept=".csv" 
        disabled={isUploading} 
      />

      <WebSalesTableHeader
        currentMonth={month}
        filterValue={filterValue}
        isLoading={dataLoading || editLoading}
        onMonthChange={handleMonthChange}
        onFilterChange={setFilterValue}
        onDeleteMonthData={handleDeleteWithRouter}
      />

      <WebSalesDataTable
        filteredItems={filteredItems}
        editMode={editMode}
        editedValue={editedValue}
        getProductName={getProductName}
        getProductPrice={getProductPrice}
        onEdit={handleEdit}
        onSave={handleSaveWithDeps}
        onEditValueChange={setEditedValue}
        onCancel={handleCancel}
      />

      <WebSalesImportButtons
        isUploading={isUploading}
        onCsvClick={handleCsvButtonClick}
        onAmazonClick={onOpenAmazonCsvModal}
      />

      <WebSalesSummary
        totalCount={totalCount}
        totalAmount={totalAmount}
      />

      <CsvImportConfirmModal 
        isOpen={isCsvModalOpen} 
        results={importResults}
        productMaster={productMaster}
        isSubmitting={isSubmittingImport}
        onClose={onCloseCsvModal}
        onConfirm={handleConfirmImportWithMonth}
        onResultChange={handleImportResultChange}
      />
      
      <AmazonCsvImportModal 
        isOpen={isAmazonCsvModalOpen} 
        onClose={onCloseAmazonCsvModal}
        month={month}
        onSuccess={handleAmazonCsvSuccess}
      />

      {/* Amazon CSV確認モーダル */}
      {showAmazonConfirm && amazonResults && (
        <AmazonCsvConfirmModal
          isOpen={showAmazonConfirm}
          results={amazonResults.matchedResults || []}
          unmatchedProducts={amazonResults.unmatchedProducts || []}
          csvSummary={amazonResults.summary}
          productMaster={productMaster}
          month={month}
          isSubmitting={isAmazonSubmitting}
          onClose={handleAmazonConfirmClose}
          onConfirm={handleAmazonConfirm}
        />
      )}
    </div>
  )
}
