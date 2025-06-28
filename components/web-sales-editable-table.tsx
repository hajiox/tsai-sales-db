// /components/web-sales-editable-table.tsx ver.49 (データ注入最終版)
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"

import WebSalesTableHeader from "./WebSalesTableHeader"
import WebSalesDataTable from "./WebSalesDataTable"
import WebSalesImportButtons from "./WebSalesImportButtons"
import WebSalesSummary from "./WebSalesSummary"
import AmazonCsvImportModal from "./AmazonCsvImportModal"
import RakutenCsvImportModal from "./RakutenCsvImportModal"
import { calculateTotalAllECSites, sortWebSalesData, filterWebSalesData } from "@/utils/webSalesUtils"
import { WebSalesData } from "@/types/db"

interface WebSalesEditableTableProps {
  initialWebSalesData: WebSalesData[]
  month: string
  onDataUpdated: () => void
}

export default function WebSalesEditableTable({
  initialWebSalesData,
  month,
  onDataUpdated,
}: WebSalesEditableTableProps) {
  const [data, setData] = useState(initialWebSalesData)
  const [filterValue, setFilterValue] = useState("")
  const [editMode, setEditMode] = useState<{ [key: string]: boolean }>({})
  const [editedValue, setEditedValue] = useState<string>("")

  const [isAmazonCsvModalOpen, setIsAmazonCsvModalOpen] = useState(false)
  const [isRakutenCsvModalOpen, setIsRakutenCsvModalOpen] = useState(false)
  
  const router = useRouter()

  useEffect(() => {
    setData(initialWebSalesData)
  }, [initialWebSalesData])

  const productMap = useMemo(() => {
    const map = new Map()
    initialWebSalesData.forEach(item => {
      map.set(item.product_id, {
        id: item.product_id,
        name: item.product_name,
        price: item.price,
        series: item.series,
        series_code: item.series_code,
        product_code: item.product_code,
      })
    })
    return map
  }, [initialWebSalesData])

  // ★ 1. モーダルに渡すための商品マスターリストを作成
  const productMasterList = useMemo(() => Array.from(productMap.values()), [productMap]);

  const getProductName = (id: string) => productMap.get(id)?.name || ""
  const getProductSeriesCode = (id: string) => productMap.get(id)?.series_code || 0
  const getProductNumber = (id: string) => productMap.get(id)?.product_code || 0
  const getProductPrice = (id: string) => productMap.get(id)?.price || 0

  const handleMonthChange = (selectedMonth: string) => {
    const params = new URLSearchParams()
    params.set("month", selectedMonth)
    router.push(`/web-sales/dashboard?${params.toString()}`)
  }

  const filteredItems = useMemo(() => {
    if (!data) return []
    const sortedData = sortWebSalesData(data, getProductSeriesCode, getProductNumber)
    return filterWebSalesData(sortedData, filterValue, getProductName)
  }, [data, filterValue])

  const totalCount = useMemo(() => calculateTotalAllECSites(filteredItems), [filteredItems])
  const totalAmount = useMemo(() => {
    let sum = 0
    filteredItems.forEach(item => {
      const productPrice = getProductPrice(item.product_id) || 0
      const totalItemQuantity = ["amazon", "rakuten", "yahoo", "mercari", "base", "qoo10"].reduce((total, site) => total + (item[`${site}_count`] || 0), 0)
      sum += totalItemQuantity * productPrice
    })
    return sum
  }, [filteredItems])

  const handleImportSuccess = () => {
    setIsAmazonCsvModalOpen(false)
    setIsRakutenCsvModalOpen(false)
    onDataUpdated()
  }

  return (
    <div className="space-y-4">
      <WebSalesTableHeader
        currentMonth={month}
        filterValue={filterValue}
        isLoading={false}
        onMonthChange={handleMonthChange}
        onFilterChange={setFilterValue}
        onDeleteMonthData={() => {}}
      />

      <WebSalesDataTable
        filteredItems={filteredItems}
        editMode={editMode}
        editedValue={editedValue}
        getProductName={getProductName}
        getProductPrice={getProductPrice}
        onEdit={(id, ec) => setEditMode({ [`${id}-${ec}`]: true })}
        onSave={() => {}}
        onEditValueChange={setEditedValue}
        onCancel={() => setEditMode({})}
        productMaster={productMasterList}
        onRefresh={onDataUpdated}
      />

      <WebSalesImportButtons
        isUploading={false}
        onCsvClick={() => alert('このボタンは現在無効です')}
        onAmazonClick={() => setIsAmazonCsvModalOpen(true)}
        onRakutenClick={() => setIsRakutenCsvModalOpen(true)}
        onLearningReset={() => {}}
      />

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">学習データ管理:</span>
        <button className="px-3 py-1 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 rounded hover:bg-red-200">
          🔄 Amazon学習データリセット
        </button>
        <button className="px-3 py-1 text-xs font-semibold text-orange-700 bg-orange-100 border border-orange-300 rounded hover:bg-orange-200">
          🔄 楽天学習データリセット
        </button>
      </div>

      <WebSalesSummary totalCount={totalCount} totalAmount={totalAmount} />
      
      {isAmazonCsvModalOpen && (
        <AmazonCsvImportModal 
          isOpen={isAmazonCsvModalOpen} 
          onClose={() => setIsAmazonCsvModalOpen(false)}
          onSuccess={handleImportSuccess}
          products={productMasterList} 
        />
      )}

      {isRakutenCsvModalOpen && (
        <RakutenCsvImportModal
          isOpen={isRakutenCsvModalOpen}
          onClose={() => setIsRakutenCsvModalOpen(false)}
          onSuccess={handleImportSuccess}
          products={productMasterList}
        />
      )}
    </div>
  )
}
