// /components/web-sales-editable-table.tsx ver.60 (過去価格表示機能付き)
// 汎用CSV機能統合版

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
import Qoo10CsvImportModal from "./Qoo10CsvImportModal"
import CsvImportModal from "./CsvImportModal"
import { calculateTotalAllECSites, sortWebSalesData, filterWebSalesData } from "@/utils/webSalesUtils"
import { WebSalesData } from "@/types/db"
import { supabase } from "../lib/supabase"
import { History } from "lucide-react"

interface WebSalesEditableTableProps {
  initialWebSalesData: WebSalesData[]
  month: string
  onDataUpdated: () => void
}

// 過去価格データの型定義
interface HistoricalPriceData {
  product_id: string
  product_name: string
  current_price: number
  historical_price: number
  total_count: number
  current_amount: number
  historical_amount: number
  price_difference: number
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
  
  // 過去価格表示モード
  const [isHistoricalMode, setIsHistoricalMode] = useState(false)
  const [historicalPriceData, setHistoricalPriceData] = useState<HistoricalPriceData[]>([])
  const [loadingHistorical, setLoadingHistorical] = useState(false)

  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [isAmazonCsvModalOpen, setIsAmazonCsvModalOpen] = useState(false)
  const [isRakutenCsvModalOpen, setIsRakutenCsvModalOpen] = useState(false)
  const [isYahooCsvModalOpen, setIsYahooCsvModalOpen] = useState(false)
  const [isMercariCsvModalOpen, setIsMercariCsvModalOpen] = useState(false)
  const [isBaseCsvModalOpen, setIsBaseCsvModalOpen] = useState(false)
  const [isQoo10CsvModalOpen, setIsQoo10CsvModalOpen] = useState(false)
  
  const router = useRouter()

  useEffect(() => {
    setData(initialWebSalesData)
  }, [initialWebSalesData])

  // 過去価格データの取得
  const fetchHistoricalPrices = async () => {
    setLoadingHistorical(true)
    try {
      const { data: historicalData, error } = await supabase.rpc(
        'calculate_sales_with_historical_prices',
        { target_month: month }
      )
      
      if (error) throw error
      
      setHistoricalPriceData(historicalData || [])
    } catch (error) {
      console.error('過去価格データの取得に失敗しました:', error)
      alert('過去価格データの取得に失敗しました')
    } finally {
      setLoadingHistorical(false)
    }
  }

  // 過去価格モードの切り替え
  const toggleHistoricalMode = () => {
    if (!isHistoricalMode && historicalPriceData.length === 0) {
      fetchHistoricalPrices()
    }
    setIsHistoricalMode(!isHistoricalMode)
  }

  const productMap = useMemo(() => {
    const map = new Map()
    
    if (isHistoricalMode && historicalPriceData.length > 0) {
      // 過去価格モードの場合
      historicalPriceData.forEach(item => {
        map.set(item.product_id, {
          id: item.product_id,
          name: item.product_name,
          price: item.historical_price, // 過去価格を使用
          currentPrice: item.current_price,
          historicalPrice: item.historical_price,
          priceDifference: item.price_difference
        })
      })
    } else {
      // 通常モードの場合
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
    }
    
    return map
  }, [initialWebSalesData, isHistoricalMode, historicalPriceData])
  
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
  }, [filteredItems, isHistoricalMode])

  const handleImportSuccess = () => {
    console.log("Import successful. Notifying parent to refresh.");
    setIsCsvModalOpen(false)
    setIsAmazonCsvModalOpen(false)
    setIsRakutenCsvModalOpen(false)
    setIsYahooCsvModalOpen(false)
    setIsMercariCsvModalOpen(false)
    setIsBaseCsvModalOpen(false)
    setIsQoo10CsvModalOpen(false)
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
        onDataUpdated()
      } else {
        throw new Error(result.error || '削除に失敗しました')
      }
    } catch (error) {
      console.error('削除エラー:', error)
      alert('削除中にエラーが発生しました: ' + (error instanceof Error ? error.message : '不明なエラー'))
    }
  }

  // ECチャネル別削除機能
  const handleChannelDelete = async (channel: 'amazon' | 'rakuten' | 'yahoo' | 'mercari' | 'base' | 'qoo10' | 'csv') => {
    const channelNames = {
      amazon: 'Amazon',
      rakuten: '楽天', 
      yahoo: 'Yahoo',
      mercari: 'メルカリ',
      base: 'BASE',
      qoo10: 'Qoo10',
      csv: '汎用CSV'
    };

    if (!confirm(`${month}の${channelNames[channel]}データを削除しますか？この操作は取り消せません。`)) {
      return
    }

    try {
      console.log(`${channelNames[channel]} delete button clicked - executing deletion for month:`, month);
      
      const response = await fetch(`/api/web-sales-data?month=${month}&channel=${channel}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(`${channelNames[channel]}データの削除に失敗しました`)
      }

      const result = await response.json()
      
      if (result.success) {
        alert(`${result.message}（${result.deletedCount}件、${result.totalQuantity}個）`)
        onDataUpdated()
      } else {
        throw new Error(result.error || `${channelNames[channel]}データの削除に失敗しました`)
      }
    } catch (error) {
      console.error(`${channelNames[channel]}削除エラー:`, error)
      alert(`${channelNames[channel]}データの削除中にエラーが発生しました: ` + (error instanceof Error ? error.message : '不明なエラー'))
    }
  }

  // 学習データリセット機能
  const handleLearningReset = async (channel: 'amazon' | 'rakuten' | 'yahoo' | 'mercari' | 'base' | 'qoo10' | 'csv') => {
    const channelNames = {
      amazon: 'Amazon',
      rakuten: '楽天', 
      yahoo: 'Yahoo',
      mercari: 'メルカリ',
      base: 'BASE',
      qoo10: 'Qoo10',
      csv: '汎用CSV'
    };

    if (!confirm(`${channelNames[channel]}の学習データをリセットしますか？`)) {
      return
    }

    try {
      const response = await fetch(`/api/learning/${channel}-reset`, {
        method: 'POST',
      })

      const result = await response.json()
      
      if (result.success) {
        alert(`${channelNames[channel]}の学習データをリセットしました（${result.deletedCount}件削除）`)
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

      {/* 過去価格表示モードボタン */}
      <div className="flex justify-between items-center">
        <button
          onClick={toggleHistoricalMode}
          disabled={loadingHistorical}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            isHistoricalMode 
              ? 'bg-amber-600 text-white hover:bg-amber-700' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          } ${loadingHistorical ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <History className="h-4 w-4" />
          {loadingHistorical ? '読み込み中...' : isHistoricalMode ? '過去価格表示中' : '過去価格で表示'}
        </button>
        
        {isHistoricalMode && historicalPriceData.length > 0 && (
          <div className="text-sm text-amber-600 font-medium">
            ※ 売上金額は{month}時点の価格で計算されています
          </div>
        )}
      </div>

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
        onChannelDelete={handleChannelDelete}
        isHistoricalMode={isHistoricalMode}
        historicalPriceData={historicalPriceData}
      />

      <WebSalesImportButtons
        isUploading={false}
        onCsvClick={() => {
          console.log('CSV button clicked!');
          setIsCsvModalOpen(true);
        }}
        onAmazonClick={() => setIsAmazonCsvModalOpen(true)}
        onRakutenClick={() => setIsRakutenCsvModalOpen(true)}
        onYahooClick={() => {
          console.log('Yahoo button clicked!');
          setIsYahooCsvModalOpen(true);
        }}
        onMercariClick={() => {
          console.log('Mercari button clicked!');
          setIsMercariCsvModalOpen(true);
        }}
        onBaseClick={() => {
          console.log('BASE button clicked!');
          setIsBaseCsvModalOpen(true);
        }}
        onQoo10Click={() => {
          console.log('Qoo10 button clicked!');
          setIsQoo10CsvModalOpen(true);
        }}
      />
      
      {/* 学習データ管理ボタン群 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700">学習データ管理:</span>
        <button 
          onClick={() => handleLearningReset('csv')}
          className="px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200"
        >
          🔄 汎用CSV学習データリセット
        </button>
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
        <button 
          onClick={() => handleLearningReset('mercari')}
          className="px-3 py-1 text-xs font-semibold text-sky-700 bg-sky-100 border border-sky-300 rounded hover:bg-sky-200"
        >
          🔄 メルカリ学習データリセット
        </button>
        <button 
          onClick={() => handleLearningReset('base')}
          className="px-3 py-1 text-xs font-semibold text-green-700 bg-green-100 border border-green-300 rounded hover:bg-green-200"
        >
          🔄 BASE学習データリセット
        </button>
        <button 
          onClick={() => handleLearningReset('qoo10')}
          className="px-3 py-1 text-xs font-semibold text-pink-700 bg-pink-100 border border-pink-300 rounded hover:bg-pink-200"
        >
          🔄 Qoo10学習データリセット
        </button>
      </div>

      {/* ECチャネル別削除ボタン群 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700">ECチャネル別データ削除:</span>
        <button 
          onClick={() => handleChannelDelete('csv')}
          className="px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200"
        >
          🗑️ 汎用CSV削除
        </button>
        <button 
          onClick={() => handleChannelDelete('amazon')}
          className="px-3 py-1 text-xs font-semibold text-orange-700 bg-orange-100 border border-orange-300 rounded hover:bg-orange-200"
        >
          🗑️ Amazon削除
        </button>
        <button 
          onClick={() => handleChannelDelete('rakuten')}
          className="px-3 py-1 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 rounded hover:bg-red-200"
        >
          🗑️ 楽天削除
        </button>
        <button 
          onClick={() => handleChannelDelete('yahoo')}
          className="px-3 py-1 text-xs font-semibold text-purple-700 bg-purple-100 border border-purple-300 rounded hover:bg-purple-200"
        >
          🗑️ Yahoo削除
        </button>
        <button 
          onClick={() => handleChannelDelete('mercari')}
          className="px-3 py-1 text-xs font-semibold text-sky-700 bg-sky-100 border border-sky-300 rounded hover:bg-sky-200"
        >
          🗑️ メルカリ削除
        </button>
        <button 
          onClick={() => handleChannelDelete('base')}
          className="px-3 py-1 text-xs font-semibold text-green-700 bg-green-100 border border-green-300 rounded hover:bg-green-200"
        >
          🗑️ BASE削除
        </button>
        <button 
          onClick={() => handleChannelDelete('qoo10')}
          className="px-3 py-1 text-xs font-semibold text-pink-700 bg-pink-100 border border-pink-300 rounded hover:bg-pink-200"
        >
          🗑️ Qoo10削除
        </button>
      </div>

      <WebSalesSummary totalCount={totalCount} totalAmount={totalAmount} />
      
      {/* 汎用CSV Modal追加 */}
      {isCsvModalOpen && (
        <CsvImportModal
          isOpen={isCsvModalOpen}
          onClose={() => setIsCsvModalOpen(false)}
          onSuccess={handleImportSuccess}
          products={productMasterList}
        />
      )}

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
          isOpen={isYahooCsvModalOpen}
          onClose={() => setIsYahooCsvModalOpen(false)}
          onSuccess={handleImportSuccess}
          products={productMasterList}
        />
      )}

      {isMercariCsvModalOpen && (
        <MercariCsvImportModal
          isOpen={isMercariCsvModalOpen}
          onClose={() => setIsMercariCsvModalOpen(false)}
          onSuccess={handleImportSuccess}
          products={productMasterList}
        />
      )}

      {isBaseCsvModalOpen && (
        <BaseCsvImportModal
          isOpen={isBaseCsvModalOpen}
          onClose={() => setIsBaseCsvModalOpen(false)}
          onSuccess={handleImportSuccess}
          products={productMasterList}
        />
      )}

      {isQoo10CsvModalOpen && (
        <Qoo10CsvImportModal
          isOpen={isQoo10CsvModalOpen}
          onClose={() => setIsQoo10CsvModalOpen(false)}
          onSuccess={handleImportSuccess}
          products={productMasterList}
        />
      )}
    </div>
  )
}
