// /components/web-sales-editable-table.tsx ver.52
// Yahoo CSVインポート機能統合版

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
    onDataUpdated()
  }

  const handleDeleteMonthData = async () => {
    if (!confirm(`${month}のデータを削除しますか？この操作は取り消せません。`)) {
      return
    }

    try {
      console.log("Delete button clicked - executing deletion for month:", month);
      
      const response = await fetch(`/api/web-sales-data?month=${month}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('削除に失敗しました')
      }

      const result = await response.json()
      
      if (result.success || result.message) {
        const deletedCount = result.deletedCount !== null ? result.deletedCount : '不明'
        alert(`${month}のデータを削除しました（${deletedCount}件）`)
        onDataUpdated() // 親コンポーネントにデータ更新を通知
      } else {
        throw new Error(result.error || '削除に失敗しました')
      }
    } catch (error) {
      console.error('削除エラー:', error)
      alert('削除中にエラーが発生しました: ' + (error instanceof Error ? error.message : '不明なエラー'))
    }
  }

  // 学習データリセット処理
  const handleLearningReset = async (channel: 'amazon' | 'rakuten' | 'yahoo') => {
    if (!confirm(`${channel === 'amazon' ? 'Amazon' : channel === 'rakuten' ? '楽天' : 'Yahoo'}の学習データをリセットしますか？`)) {
      return
    }

    try {
      const response = await fetch(`/api/learning/${channel}-reset`, {
        method: 'POST',
      })

      const result = await response.json()
      
      if (result.success) {
        alert(`${channel === 'amazon' ? 'Amazon' : channel === 'rakuten' ? '楽天' : 'Yahoo'}の学習データをリセットしました`)
      } else {
        throw new Error(result.error || 'リセットに失敗しました')
      }
    } catch (error) {
      console.error('学習データリセットエラー:', error)
      alert('リセット中にエラーが発生しました: ' + (error instanceof Error ? error.message : '不明なエラー'))
    }
  }

  return (
    <div className="space-y-4">
      <WebSalesTableHeader
        currentMonth={month}
        filterValue={filterValue}
        isLoading={false}
        onMonthChange={handleMonthChange}
        onFilterChange={setFilterValue}
        onDeleteMonthData={handleDeleteMonthData}
      />

      <WebSalesDataTable
        filteredItems={filteredItems}
        editMode={editMode}
        editedValue={editedValue}
        getProductName={getProductName}
        getProductPrice={getProductPrice}
        onEdit={(id, ec) => setEditMode({ [`${id}-${ec}`]: true })}
        onSave={() => { console.log("Save button clicked"); }}
        onEditValueChange={setEditedValue}
        onCancel={() => setEditMode({})}
        productMaster={productMasterList}
        onRefresh={onDataUpdated}
      />

      <WebSalesImportButtons
        isUploading={false}
        onCsvClick={() => alert('This button is currently disabled')}
        onAmazonClick={() => setIsAmazonCsvModalOpen(true)}
        onRakutenClick={() => setIsRakutenCsvModalOpen(true)}
        onYahooClick={() => {
          console.log('Yahoo button clicked!');
          setIsYahooCsvModalOpen(true);
        }}
      />
      
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">学習データ管理:</span>
        <button 
          onClick={() => handleLearningReset('amazon')}
          className="px-3 py-1 text-xs font-semibold text-orange-700 bg-orange-100 border border-orange-300 rounded hover:bg-orange-200"
        >
          🔄 Amazon学習データリセット
        </button>
        <button 
          onClick={() => handleLearningReset('rakuten')}
          className="px-3 py-1 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 rounded hover:bg-red-200"
        >
          🔄 楽天学習データリセット
        </button>
        <button 
          onClick={() => handleLearningReset('yahoo')}
          className="px-3 py-1 text-xs font-semibold text-purple-700 bg-purple-100 border border-purple-300 rounded hover:bg-purple-200"
        >
          🔄 Yahoo学習データリセット
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

      {isYahooCsvModalOpen && (
        <YahooCsvImportModal
          onImportComplete={handleImportSuccess}
          selectedMonth={month}
          isOpen={isYahooCsvModalOpen}
          onClose={() => setIsYahooCsvModalOpen(false)}
          products={productMasterList}
        />
      )}
    </div>
  )
}
