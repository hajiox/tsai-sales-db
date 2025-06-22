// /components/web-sales-editable-table.tsx ver.41
"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
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
  calculateTotalAmountAllECSites, // この関数はECサイトごとの合計ではなく、商品全体の合計金額を計算するように変更します
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
  const [currentMonth, setCurrentMonth] = useState(month)
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

  useEffect(() => {
    setCurrentMonth(month)
  }, [month])

  // Set product master for CSV import
  useEffect(() => {
    const products = Array.from(productMap.values())
    const masterData = products.map(p => ({ id: p.id, name: p.name }))
    setProductMaster(masterData)
  }, [productMap, setProductMaster])

  const handleMonthChange = useCallback(
    (selectedMonth: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("month", selectedMonth)
      router.push(`${pathname}?${params.toString()}`)
    },
    [searchParams, router, pathname],
  )

  const filteredItems = useMemo(() => {
    const sortedData = sortWebSalesData(data, getProductSeriesCode, getProductNumber)
    return filterWebSalesData(sortedData, filterValue, getProductName)
  }, [data, filterValue, getProductSeriesCode, getProductNumber, getProductName])

  // 各ECサイトの合計数量を計算
  const totalCount = calculateTotalAllECSites(filteredItems);
  
  // 各ECサイトの販売金額合計と、全ECサイトの合計金額を計算
  // このロジックはWebSalesDataTableに渡すことになります
  // ここでは全体の合計金額を計算します
  const totalAmount = useMemo(() => {
    let sum = 0;
    filteredItems.forEach(item => {
      const productPrice = getProductPrice(item.product_id) || 0;
      const totalItemQuantity = calculateTotalAllECSites([item]); // 単一アイテムの合計数量
      sum += totalItemQuantity * productPrice;
    });
    return sum;
  }, [filteredItems, getProductPrice]);

  const handleSaveWithDeps = useCallback(
    (productId: string, ecSite: string) => {
      handleSave(productId, ecSite, month, data, setData, getProductPrice)
    },
    [handleSave, month, data, setData, getProductPrice]
  )

  const handleFileSelectWithMonth = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileSelect(e, month)
    },
    [handleFileSelect, month]
  )

  const handleConfirmImportWithMonth = useCallback(
    (updatedResults: any[]) => {
      handleConfirmImport(updatedResults, month)
    },
    [handleConfirmImport, month]
  )

  const handleDeleteWithRouter = useCallback(() => {
    handleDeleteMonthData(currentMonth, router)
  }, [handleDeleteMonthData, currentMonth, router])

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
        currentMonth={currentMonth}
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
        getProductPrice={getProductPrice} {/* <-- 追加 */}
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
