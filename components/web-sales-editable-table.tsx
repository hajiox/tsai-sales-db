// /components/web-sales-editable-table.tsx ver.67 (単価スナップショット方式)
// 履歴モード削除・各月に保存されたunit_priceで自動計算

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
import { calculateTotalAllECSites, sortWebSalesData, filterWebSalesData } from "@/utils/webSalesUtils"
import { WebSalesData } from "@/types/db"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"

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
  const supabase = getSupabaseBrowserClient();
  const [data, setData] = useState(initialWebSalesData)
  const [filterValue, setFilterValue] = useState("")
  const [editMode, setEditMode] = useState<{ [key: string]: boolean }>({})
  const [editedValue, setEditedValue] = useState<string>("")
  const [originalValues, setOriginalValues] = useState<{ [key: string]: number }>({})

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

  // productMap: RPC関数がunit_priceをpriceとして返すので、そのまま使う
  const productMap = useMemo(() => {
    const map = new Map()
    initialWebSalesData.forEach(item => {
      if (item.product_id && item.product_name) {
        map.set(item.product_id, {
          id: item.product_id,
          name: item.product_name,
          price: item.price, // RPC関数が COALESCE(ws.unit_price, p.price) を返す
          profit_rate: item.profit_rate || 0,
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
  }, [productMap])

  const getProductName = (id: string) => productMap.get(id)?.name || ""
  const getProductSeriesCode = (id: string) => productMap.get(id)?.series_code || 0
  const getProductNumber = (id: string) => productMap.get(id)?.product_code || 0
  const getProductPrice = (id: string) => productMap.get(id)?.price || 0
  const getProductProfitRate = (id: string) => productMap.get(id)?.profit_rate || 0

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
      qoo10: 'Qoo10',
      tiktok: 'TikTok',
      all: '全チャネル'
    };

    const isConfirmed = confirm(
      `${channelNames[channel]}のデータを削除してもよろしいですか？\n\n` +
      `対象月: ${month}\n` +
      `この操作は取り消せません。`
    );

    if (!isConfirmed) return;

    try {
      const response = await fetch('/api/web-sales/channel-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, month }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'データの削除に失敗しました');
      }

      alert(`${channelNames[channel]}のデータを削除しました。（${result.updatedCount}件更新）`);
      onDataUpdated();
    } catch (error) {
      console.error('削除エラー:', error);
      alert('データの削除に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'));
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
      qoo10: 'Qoo10',
      tiktok: 'TikTok'
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
        // 新規挿入時は現在の商品価格をunit_priceとして保存
        const { data: productData } = await supabase
          .from('products')
          .select('price, profit_rate')
          .eq('id', itemId)
          .single()

        const defaultData = {
          product_id: itemId,
          report_month: reportMonth,
          amazon_count: 0,
          rakuten_count: 0,
          yahoo_count: 0,
          mercari_count: 0,
          base_count: 0,
          qoo10_count: 0,
          tiktok_count: 0,
          unit_price: productData?.price || 0,
          unit_profit_rate: productData?.profit_rate || 0,
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

  return (
    <div className="space-y-4">
      <WebSalesTableHeader
        month={month}
        filterValue={filterValue}
        onMonthChange={handleMonthChange}
        onFilterChange={setFilterValue}
      />

      {/* ===== 商品一覧テーブルの上：データ取り込み＆チャネル別削除ボタン ===== */}
      <WebSalesImportButtons
        isUploading={false}
        onCsvClick={() => {
          console.log('CSV button clicked!');
          setIsCsvModalOpen(true);
        }}
        onAmazonClick={() => setIsAmazonCsvModalOpen(true)}
        onRakutenClick={() => setIsRakutenCsvModalOpen(true)}
        onYahooClick={() => {
          setIsYahooCsvModalOpen(true);
        }}
        onMercariClick={() => {
          setIsMercariCsvModalOpen(true);
        }}
        onBaseClick={() => {
          setIsBaseCsvModalOpen(true);
        }}
        onQoo10Click={() => {
          setIsQoo10CsvModalOpen(true);
        }}
        onTiktokClick={() => {
          setIsTiktokCsvModalOpen(true);
        }}
      />

      {/* ECチャネル別削除ボタン群（上部） */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700">ECチャネル別データ削除:</span>
        <button onClick={() => handleChannelDelete('all')} className="px-3 py-1 text-xs font-semibold text-white bg-red-600 border border-red-700 rounded hover:bg-red-700">⚠️ 全チャネル一括削除</button>
        <button onClick={() => handleChannelDelete('csv')} className="px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200">🗑️ 汎用CSV削除</button>
        <button onClick={() => handleChannelDelete('amazon')} className="px-3 py-1 text-xs font-semibold text-orange-700 bg-orange-100 border border-orange-300 rounded hover:bg-orange-200">🗑️ Amazon削除</button>
        <button onClick={() => handleChannelDelete('rakuten')} className="px-3 py-1 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 rounded hover:bg-red-200">🗑️ 楽天削除</button>
        <button onClick={() => handleChannelDelete('yahoo')} className="px-3 py-1 text-xs font-semibold text-purple-700 bg-purple-100 border border-purple-300 rounded hover:bg-purple-200">🗑️ Yahoo削除</button>
        <button onClick={() => handleChannelDelete('mercari')} className="px-3 py-1 text-xs font-semibold text-sky-700 bg-sky-100 border border-sky-300 rounded hover:bg-sky-200">🗑️ メルカリ削除</button>
        <button onClick={() => handleChannelDelete('base')} className="px-3 py-1 text-xs font-semibold text-green-700 bg-green-100 border border-green-300 rounded hover:bg-green-200">🗑️ BASE削除</button>
        <button onClick={() => handleChannelDelete('qoo10')} className="px-3 py-1 text-xs font-semibold text-pink-700 bg-pink-100 border border-pink-300 rounded hover:bg-pink-200">🗑️ Qoo10削除</button>
        <button onClick={() => handleChannelDelete('tiktok')} className="px-3 py-1 text-xs font-semibold text-teal-700 bg-teal-100 border border-teal-300 rounded hover:bg-teal-200">🗑️ TikTok削除</button>
      </div>

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
        <button onClick={() => handleLearningReset('csv')} className="px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200">🔄 汎用CSV学習データリセット</button>
        <button onClick={() => handleLearningReset('amazon')} className="px-3 py-1 text-xs font-semibold text-orange-700 bg-orange-100 border border-orange-300 rounded hover:bg-orange-200">🔄 Amazon学習データリセット</button>
        <button onClick={() => handleLearningReset('rakuten')} className="px-3 py-1 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 rounded hover:bg-red-200">🔄 楽天学習データリセット</button>
        <button onClick={() => handleLearningReset('yahoo')} className="px-3 py-1 text-xs font-semibold text-purple-700 bg-purple-100 border border-purple-300 rounded hover:bg-purple-200">🔄 Yahoo学習データリセット</button>
        <button onClick={() => handleLearningReset('mercari')} className="px-3 py-1 text-xs font-semibold text-sky-700 bg-sky-100 border border-sky-300 rounded hover:bg-sky-200">🔄 メルカリ学習データリセット</button>
        <button onClick={() => handleLearningReset('base')} className="px-3 py-1 text-xs font-semibold text-green-700 bg-green-100 border border-green-300 rounded hover:bg-green-200">🔄 BASE学習データリセット</button>
        <button onClick={() => handleLearningReset('qoo10')} className="px-3 py-1 text-xs font-semibold text-pink-700 bg-pink-100 border border-pink-300 rounded hover:bg-pink-200">🔄 Qoo10学習データリセット</button>
        <button onClick={() => handleLearningReset('tiktok')} className="px-3 py-1 text-xs font-semibold text-teal-700 bg-teal-100 border border-teal-300 rounded hover:bg-teal-200">🔄 TikTok学習データリセット</button>
      </div>

      {/* ECチャネル別削除ボタン群 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700">ECチャネル別データ削除:</span>
        <button onClick={() => handleChannelDelete('all')} className="px-3 py-1 text-xs font-semibold text-white bg-red-600 border border-red-700 rounded hover:bg-red-700">⚠️ 全チャネル一括削除</button>
        <button onClick={() => handleChannelDelete('csv')} className="px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200">🗑️ 汎用CSV削除</button>
        <button onClick={() => handleChannelDelete('amazon')} className="px-3 py-1 text-xs font-semibold text-orange-700 bg-orange-100 border border-orange-300 rounded hover:bg-orange-200">🗑️ Amazon削除</button>
        <button onClick={() => handleChannelDelete('rakuten')} className="px-3 py-1 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 rounded hover:bg-red-200">🗑️ 楽天削除</button>
        <button onClick={() => handleChannelDelete('yahoo')} className="px-3 py-1 text-xs font-semibold text-purple-700 bg-purple-100 border border-purple-300 rounded hover:bg-purple-200">🗑️ Yahoo削除</button>
        <button onClick={() => handleChannelDelete('mercari')} className="px-3 py-1 text-xs font-semibold text-sky-700 bg-sky-100 border border-sky-300 rounded hover:bg-sky-200">🗑️ メルカリ削除</button>
        <button onClick={() => handleChannelDelete('base')} className="px-3 py-1 text-xs font-semibold text-green-700 bg-green-100 border border-green-300 rounded hover:bg-green-200">🗑️ BASE削除</button>
        <button onClick={() => handleChannelDelete('qoo10')} className="px-3 py-1 text-xs font-semibold text-pink-700 bg-pink-100 border border-pink-300 rounded hover:bg-pink-200">🗑️ Qoo10削除</button>
        <button onClick={() => handleChannelDelete('tiktok')} className="px-3 py-1 text-xs font-semibold text-teal-700 bg-teal-100 border border-teal-300 rounded hover:bg-teal-200">🗑️ TikTok削除</button>
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
          products={productMasterList}
        />
      )}
    </div>
  )
}
