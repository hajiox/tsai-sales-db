// /components/web-sales-editable-table.tsx ver.65 (TikTok対応版)
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
import TiktokCsvImportModal from "./TiktokCsvImportModal"
import CsvImportModal from "./CsvImportModal"
import PriceHistoryManagementModal from "./PriceHistoryManagementModal"
import { calculateTotalAllECSites, sortWebSalesData, filterWebSalesData } from "@/utils/webSalesUtils"
import { WebSalesData } from "@/types/db"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import { History, Calendar } from "lucide-react"

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
  current_profit_rate?: number
  historical_profit_rate?: number
  total_count: number
  current_amount: number
  historical_amount: number
  price_difference: number
}

// 価格変更日の型定義
interface PriceChangeDate {
  change_date: string
  product_count: number
}

export default function WebSalesEditableTable({
  initialWebSalesData,
  month,
  onDataUpdated,
}: WebSalesEditableTableProps) {
  const supabase = getSupabaseBrowserClient();
  const [data, setData] = useState(initialWebSalesData)
  const [filterValue, setFilterValue] = useState("")
  const [editMode, setEditMode] = useState<{ [key: string]: boolean }>({})
  const [editedValue, setEditedValue] = useState<string>("")
  const [originalValues, setOriginalValues] = useState<{ [key: string]: number }>({})
  
  // 過去価格表示モード
  const [isHistoricalMode, setIsHistoricalMode] = useState(false)
  const [historicalPriceData, setHistoricalPriceData] = useState<HistoricalPriceData[]>([])
  const [loadingHistorical, setLoadingHistorical] = useState(false)
  
  // 価格変更日付管理
  const [priceChangeDates, setPriceChangeDates] = useState<PriceChangeDate[]>([])
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null)
  const [showHistoryManagementModal, setShowHistoryManagementModal] = useState(false)

  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [isAmazonCsvModalOpen, setIsAmazonCsvModalOpen] = useState(false)
  const [isRakutenCsvModalOpen, setIsRakutenCsvModalOpen] = useState(false)
  const [isYahooCsvModalOpen, setIsYahooCsvModalOpen] = useState(false)
  const [isMercariCsvModalOpen, setIsMercariCsvModalOpen] = useState(false)
  const [isBaseCsvModalOpen, setIsBaseCsvModalOpen] = useState(false)
  const [isQoo10CsvModalOpen, setIsQoo10CsvModalOpen] = useState(false)
  const [isTiktokCsvModalOpen, setIsTiktokCsvModalOpen] = useState(false)
  
  const router = useRouter()

  useEffect(() => {
    setData(initialWebSalesData)
  }, [initialWebSalesData])

  // 価格変更日付の取得
  useEffect(() => {
    fetchPriceChangeDates()
  }, [])

  const fetchPriceChangeDates = async () => {
    try {
      const { data, error } = await supabase
        .from('product_price_history')
        .select('valid_from, product_id')
        .order('valid_from', { ascending: false })
      
      if (error) throw error
      
      // 日付ごとにグループ化
      const dateMap = new Map<string, Set<string>>()
      data?.forEach(item => {
        const date = new Date(item.valid_from).toISOString().split('T')[0]
        if (!dateMap.has(date)) {
          dateMap.set(date, new Set())
        }
        dateMap.get(date)?.add(item.product_id)
      })
      
      // 最新5件の日付を取得
      const dates = Array.from(dateMap.entries())
        .map(([date, products]) => ({
          change_date: date,
          product_count: products.size
        }))
        .slice(0, 5)
      
      setPriceChangeDates(dates)
    } catch (error) {
      console.error('価格変更日付の取得に失敗しました:', error)
    }
  }

  // 特定日付の価格で表示
  const showPriceAtDate = async (date: string) => {
    setLoadingHistorical(true)
    setSelectedHistoryDate(date)
    try {
      // ここで特定日付の価格データを取得する処理を実装
      // 現在の実装では month を使用していますが、date を使用するように変更が必要
      const { data: historicalData, error } = await supabase.rpc(
        'calculate_sales_with_historical_prices',
        { target_month: month } // 将来的には target_date に変更
      )
      
      if (error) throw error
      
      setHistoricalPriceData(historicalData || [])
      setIsHistoricalMode(true)
    } catch (error) {
      console.error('過去価格データの取得に失敗しました:', error)
      alert('過去価格データの取得に失敗しました')
    } finally {
      setLoadingHistorical(false)
    }
  }

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
    setSelectedHistoryDate(null)
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
          profit_rate: item.historical_profit_rate || 0, // 過去の利益率
          currentPrice: item.current_price,
          currentProfitRate: item.current_profit_rate || 0,
          historicalPrice: item.historical_price,
          historicalProfitRate: item.historical_profit_rate || 0,
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
            profit_rate: item.profit_rate || 0, // 利益率を追加
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
  const getProductSeriesCode = (id: string) => productMap.get(id)?.series_code || 0
  const getProductNumber = (id: string) => productMap.get(id)?.product_code || 0
  const getProductPrice = (id: string) => productMap.get(id)?.price || 0
  const getProductProfitRate = (id: string) => productMap.get(id)?.profit_rate || 0 // 利益率取得関数を追加

  const handleMonthChange = (selectedMonth: string) => {
    const params = new URLSearchParams()
    params.set("month", selectedMonth)
    router.push(`/web-sales/dashboard?${params.toString()}`)
  }

  const filteredItems = useMemo(() => {
    const filtered = filterWebSalesData(data, filterValue)
    return sortWebSalesData(filtered)
  }, [data, filterValue])

  const { totalCount, totalAmount } = useMemo(() => {
    return calculateTotalAllECSites(filteredItems, productMap)
  }, [filteredItems, productMap])

  const handleChannelDelete = async (channel: string) => {
    const channelNames: { [key: string]: string } = {
      csv: '汎用CSV',
      amazon: 'Amazon',
      rakuten: '楽天',
      yahoo: 'Yahoo',
      mercari: 'メルカリ',
      base: 'BASE',
      qoo10: 'Qoo10'
    };

    const isConfirmed = confirm(
      `${channelNames[channel]}のデータを削除してもよろしいですか？\n\n` +
      `対象月: ${month}\n` +
      `この操作は取り消せません。`
    );

    if (!isConfirmed) return;

    try {
      const columnName = channel === 'csv' ? 'csv_count' : `${channel}_count`;
      
      const { data: existingData, error: fetchError } = await supabase
        .from('web_sales_summary')
        .select('*')
        .eq('report_month', `${month}-01`);

      if (fetchError) throw fetchError;

      if (!existingData || existingData.length === 0) {
        alert('削除対象のデータが見つかりませんでした。');
        return;
      }

      const updates = existingData.map(record => ({
        id: record.id,
        [columnName]: 0
      }));

      const { error: updateError } = await supabase
        .from('web_sales_summary')
        .upsert(updates);

      if (updateError) throw updateError;

      alert(`${channelNames[channel]}のデータを削除しました。`);
      onDataUpdated();
    } catch (error) {
      console.error('削除エラー:', error);
      alert('データの削除に失敗しました。');
    }
  };

  const handleLearningReset = async (channel: string) => {
    const channelNames: { [key: string]: string } = {
      csv: '汎用CSV',
      amazon: 'Amazon',
      rakuten: '楽天',
      yahoo: 'Yahoo',
      mercari: 'メルカリ',
      base: 'BASE',
      qoo10: 'Qoo10'
    };

    const tableName = `${channel}_product_mapping`;

    const isConfirmed = confirm(
      `${channelNames[channel]}の学習データをリセットしてもよろしいですか？\n\n` +
      `この操作により、これまでの商品マッピング情報が全て削除されます。\n` +
      `次回のCSVインポート時に、再度商品の割り当てが必要になります。\n\n` +
      `この操作は取り消せません。`
    );

    if (!isConfirmed) return;

    try {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // 全件削除（ダミー条件）

      if (error) throw error;

      alert(`${channelNames[channel]}の学習データをリセットしました。`);
    } catch (error) {
      console.error('学習データリセットエラー:', error);
      alert('学習データのリセットに失敗しました。');
    }
  };

  const handleEditStart = (itemId: string, field: string, value: number) => {
    const key = `${itemId}-${field}`
    setEditMode((prev) => ({ ...prev, [key]: true }))
    setEditedValue(value.toString())
    setOriginalValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async (itemId: string, field: string) => {
    const key = `${itemId}-${field}`
    const newValue = parseInt(editedValue, 10)

    if (isNaN(newValue) || newValue < 0) {
      alert("有効な数値を入力してください")
      return
    }

    try {
      const reportMonth = `${month}-01`
      const updateData: any = {
        product_id: itemId,
        report_month: reportMonth,
        [field]: newValue,
        report_date: new Date().toISOString().split('T')[0]
      }

      const { data: existingRecord, error: fetchError } = await supabase
        .from('web_sales_summary')
        .select('*')
        .eq('product_id', itemId)
        .eq('report_month', reportMonth)
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError
      }

      if (existingRecord) {
        const { error: updateError } = await supabase
          .from('web_sales_summary')
          .update(updateData)
          .eq('id', existingRecord.id)

        if (updateError) throw updateError
      } else {
        const defaultData = {
          product_id: itemId,
          report_month: reportMonth,
          amazon_count: 0,
          rakuten_count: 0,
          yahoo_count: 0,
          mercari_count: 0,
          base_count: 0,
          qoo10_count: 0,
          report_date: new Date().toISOString().split('T')[0],
          [field]: newValue
        }

        const { error: insertError } = await supabase
          .from('web_sales_summary')
          .insert(defaultData)

        if (insertError) throw insertError
      }

      setData((prevData) =>
        prevData.map((item) => {
          if (item.product_id === itemId) {
            return { ...item, [field]: newValue }
          }
          return item
        })
      )

      setEditMode((prev) => ({ ...prev, [key]: false }))
      onDataUpdated()
    } catch (error) {
      console.error("保存エラー:", error)
      alert("データの保存に失敗しました")
    }
  }

  const handleCancel = (itemId: string, field: string) => {
    const key = `${itemId}-${field}`
    setEditMode((prev) => ({ ...prev, [key]: false }))
    setEditedValue("")
  }

  const handleImportSuccess = () => {
    setIsCsvModalOpen(false)
    setIsAmazonCsvModalOpen(false)
    setIsRakutenCsvModalOpen(false)
    setIsYahooCsvModalOpen(false)
    setIsMercariCsvModalOpen(false)
    setIsBaseCsvModalOpen(false)
    setIsQoo10CsvModalOpen(false)
    setIsTiktokCsvModalOpen(false)
    onDataUpdated()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  }

  return (
    <div className="space-y-4">
      <WebSalesTableHeader
        month={month}
        filterValue={filterValue}
        onMonthChange={handleMonthChange}
        onFilterChange={setFilterValue}
      />
      
      {/* 過去価格表示ボタンと価格変更日付ボタン */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={toggleHistoricalMode}
          disabled={loadingHistorical}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            isHistoricalMode
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          } disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
        >
          <History className="h-4 w-4" />
          {loadingHistorical ? '読み込み中...' : isHistoricalMode ? '現在価格で表示' : '過去価格で表示'}
        </button>

        {priceChangeDates.length > 0 && (
          <>
            <span className="text-sm text-gray-600">価格変更日:</span>
            {priceChangeDates.map((dateInfo, index) => (
              <button
                key={index}
                onClick={() => showPriceAtDate(dateInfo.change_date)}
                disabled={loadingHistorical}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  selectedHistoryDate === dateInfo.change_date
                    ? 'bg-blue-500 text-white'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                } disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1`}
              >
                <Calendar className="h-3 w-3" />
                {formatDate(dateInfo.change_date)} ({dateInfo.product_count}商品)
              </button>
            ))}
          </>
        )}

        <button
          onClick={() => setShowHistoryManagementModal(true)}
          className="px-4 py-2 rounded-md text-sm font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors flex items-center gap-2"
        >
          <History className="h-4 w-4" />
          履歴の管理
        </button>
      </div>
      
      {(isHistoricalMode || selectedHistoryDate) && historicalPriceData.length > 0 && (
        <div className="text-sm text-amber-600 font-medium">
          ※ 売上金額は{selectedHistoryDate ? formatDate(selectedHistoryDate) : month}時点の価格で計算されています
        </div>
      )}

      <WebSalesDataTable
        filteredItems={filteredItems}
        editMode={editMode}
        editedValue={editedValue}
        getProductName={getProductName}
        getProductPrice={getProductPrice}
        getProductProfitRate={getProductProfitRate}
        getProductSeriesCode={getProductSeriesCode}
        onEdit={handleEditStart}
        onSave={handleSave}
        onEditValueChange={setEditedValue}
        onCancel={handleCancel}
        productMaster={productMasterList}
        onRefresh={onDataUpdated}
        onChannelDelete={handleChannelDelete}
        isHistoricalMode={isHistoricalMode || !!selectedHistoryDate}
        historicalPriceData={historicalPriceData}
        month={month}
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
        onTiktokClick={() => {
          console.log('TikTok button clicked!');
          setIsTiktokCsvModalOpen(true);
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
        <button 
          onClick={() => handleLearningReset('tiktok')}
          className="px-3 py-1 text-xs font-semibold text-teal-700 bg-teal-100 border border-teal-300 rounded hover:bg-teal-200"
        >
          🔄 TikTok学習データリセット
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
        <button 
          onClick={() => handleChannelDelete('tiktok')}
          className="px-3 py-1 text-xs font-semibold text-teal-700 bg-teal-100 border border-teal-300 rounded hover:bg-teal-200"
        >
          🗑️ TikTok削除
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

      {isTiktokCsvModalOpen && (
        <TiktokCsvImportModal
          isOpen={isTiktokCsvModalOpen}
          onClose={() => setIsTiktokCsvModalOpen(false)}
          onImportComplete={handleImportSuccess}
        />
      )}

      {/* 価格履歴管理モーダル */}
      {showHistoryManagementModal && (
        <PriceHistoryManagementModal
          isOpen={showHistoryManagementModal}
          onClose={() => setShowHistoryManagementModal(false)}
          onRefresh={() => {
            fetchPriceChangeDates()
            onDataUpdated()
          }}
        />
      )}
    </div>
  )
}
