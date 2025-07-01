// /components/web-sales-editable-table.tsx ver.58
// Qoo10完全統合版

"use client"

import React, { useState, useEffect, useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"

import WebSalesTableHeader from "./WebSalesTableHeader"
import WebSalesDataTable from "./WebSalesDataTable"
import WebSalesImportButtons from "./WebSalesImportButtons"
import WebSalesSummary from "./WebSalesSummary"
import AmazonCsvImportModal from "./AmazonCsvImportModal"
import RakutenCsvImportModal from "./RakutenCsvImportModal"
import YahooCsvImportModal from "./YahooCsvImportModal"
import MercariCsvImportModal from "./MercariCsvImportModal"
import BaseCsvImportModal from "./BaseCsvImportModal"
import Qoo10CsvImportModal from "./Qoo10CsvImportModal"  // 🟣 Qoo10追加
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
  const [isYahooCsvModalOpen, setIsYahooCsvModalOpen] = useState(false)
  const [isMercariCsvModalOpen, setIsMercariCsvModalOpen] = useState(false)
  const [isBaseCsvModalOpen, setIsBaseCsvModalOpen] = useState(false)
  const [isQoo10CsvModalOpen, setIsQoo10CsvModalOpen] = useState(false)  // 🟣 Qoo10追加
  
  const router = useRouter()

  useEffect(() => {
    setData(initialWebSalesData)
  }, [initialWebSalesData])

  const productMap = useMemo(() => {
    const map = new Map()
    initialWebSalesData.forEach(item => {
      if (item.product_id && item.product_name) {
          map.set(item.product_id, {
            id: item.product_id,
            name: item.product_name,
            price: item.price,
            series: item.series,
            series_code: item.series_code,
            product_code: item.product_code,
          })
      }
    })
    return map
  }, [initialWebSalesData])
  
  const productMasterList = useMemo(() => {
    return Array.from(productMap.values());
  }, [productMap]);

  const getProductName = (id: string) => productMap.get(id)?.name || ""
  const getProductSeriesCode = (id:string) => productMap.get(id)?.series_code || 0
  const getProductNumber = (id:string) => productMap.get(id)?.product_code || 0
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
    console.log("Import successful. Notifying parent to refresh.");
    setIsAmazonCsvModalOpen(false)
    setIsRakutenCsvModalOpen(false)
    setIsYahooCsvModalOpen(false)
    setIsMercariCsvM
