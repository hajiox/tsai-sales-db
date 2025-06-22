// /components/web-sales-editable-table.tsx ver.43
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useDisclosure } from "@nextui-org/modal"

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

  // Amazon CSV Modal
  const {
    isOpen: isAmazonCsvModalOpen,
    onOpen: onOpenAmazonCsvModal,
    onClose: onCloseAmazonCsvModal,
  } = useDisclosure()

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
      />
    </div>
  )
}
