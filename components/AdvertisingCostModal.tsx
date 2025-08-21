// /components/AdvertisingCostModal.tsx ver.1
"use client"

import React, { useState, useEffect } from "react"
import { X } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"

interface AdvertisingCostModalProps {
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
  month: string // YYYY-MM形式
}

interface SeriesData {
  series_code: number
  series_name: string
  amazon_cost: number
  google_cost: number
  other_cost: number
}

export default function AdvertisingCostModal({
  isOpen,
  onClose,
  onUpdate,
  month
}: AdvertisingCostModalProps) {
  const supabase = getSupabaseBrowserClient()
  const [seriesData, setSeriesData] = useState<SeriesData[]>([])
  const [rakutenCost, setRakutenCost] = useState("")
  const [yahooCost, setYahooCost] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchData()
    }
  }, [isOpen, month])

  const fetchData = async () => {
    setLoading(true)
    try {
      // シリーズ一覧を取得
      const { data: seriesList, error: seriesError } = await supabase
        .from('products')
        .select('series_code, series')
        .not('series_code', 'is', null)
        .order('series_code')

      if (seriesError) throw seriesError

      // 重複を除く
      const uniqueSeries = Array.from(
        new Map(seriesList.map(item => [item.series_code, item])).values()
      )

      // 広告費データを取得
      const { data: adCosts, error: adError } = await supabase
        .from('advertising_costs')
        .select('*')
        .eq('report_month', `${month}-01`)

      if (adError) throw adError

      // データを結合
      const combinedData = uniqueSeries.map(series => {
        const adData = adCosts?.find(ad => ad.series_code === series.series_code)
        return {
          series_code: series.series_code,
          series_name: series.series,
          amazon_cost: adData?.amazon_cost || 0,
          google_cost: adData?.google_cost || 0,
          other_cost: adData?.other_cost || 0
        }
      })

      setSeriesData(combinedData)

      // 楽天・Yahoo広告費を取得（どのシリーズでも同じ値なので最初のレコードから取得）
      if (adCosts && adCosts.length > 0) {
        setRakutenCost(adCosts[0].rakuten_cost?.toString() || "0")
        setYahooCost(adCosts[0].yahoo_cost?.toString() || "0")
      } else {
        setRakutenCost("0")
        setYahooCost("0")
      }

    } catch (error) {
      console.error('データの取得に失敗しました:', error)
      alert('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleSeriesUpdate = (index: number, field: keyof SeriesData, value: string) => {
    const newData = [...seriesData]
    newData[index] = {
      ...newData[index],
      [field]: parseInt(value) || 0
    }
    setSeriesData(newData)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      // 各シリーズの広告費を保存
      for (const series of seriesData) {
        const { error } = await supabase
          .from('advertising_costs')
          .upsert({
            series_code: series.series_code,
            report_month: `${month}-01`,
            amazon_cost: series.amazon_cost,
            google_cost: series.google_cost,
            other_cost: series.other_cost,
            rakuten_cost: parseInt(rakutenCost) || 0,
            yahoo_cost: parseInt(yahooCost) || 0
          }, {
            onConflict: 'series_code,report_month'
          })

        if (error) throw error
      }

      alert('広告費を保存しました')
      onUpdate()
      onClose()
    } catch (error) {
      console.error('保存に失敗しました:', error)
      alert('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const calculateDistributedCost = (totalCost: string) => {
    const cost = parseInt(totalCost) || 0
    const seriesCount = seriesData.length || 1
    return Math.round(cost / seriesCount)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">広告費管理 - {month}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 楽天・Yahoo広告費（全体） */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">全シリーズ均等配分広告費</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    楽天広告費（全体）
                  </label>
                  <input
                    type="number"
                    value={rakutenCost}
                    onChange={(e) => setRakutenCost(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                  <div className="text-sm text-gray-600 mt-1">
                    シリーズあたり: ¥{calculateDistributedCost(rakutenCost).toLocaleString()}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Yahoo広告費（全体）
                  </label>
                  <input
                    type="number"
                    value={yahooCost}
                    onChange={(e) => setYahooCost(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                  <div className="text-sm text-gray-600 mt-1">
                    シリーズあたり: ¥{calculateDistributedCost(yahooCost).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* シリーズ別広告費 */}
            <div className="overflow-y-auto max-h-[50vh]">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b">
                    <th className="text-left p-2">シリーズ</th>
                    <th className="text-center p-2">Amazon広告費</th>
                    <th className="text-center p-2">Google広告費</th>
                    <th className="text-center p-2">その他広告費</th>
                    <th className="text-center p-2">合計（楽天・Yahoo含む）</th>
                  </tr>
                </thead>
                <tbody>
                  {seriesData.map((series, index) => {
                    const total = series.amazon_cost + series.google_cost + series.other_cost +
                                  calculateDistributedCost(rakutenCost) + calculateDistributedCost(yahooCost)
                    return (
                      <tr key={series.series_code} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{series.series_name}</td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={series.amazon_cost}
                            onChange={(e) => handleSeriesUpdate(index, 'amazon_cost', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            min="0"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={series.google_cost}
                            onChange={(e) => handleSeriesUpdate(index, 'google_cost', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            min="0"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={series.other_cost}
                            onChange={(e) => handleSeriesUpdate(index, 'other_cost', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            min="0"
                          />
                        </td>
                        <td className="p-2 text-center font-semibold">
                          ¥{total.toLocaleString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                disabled={saving}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                disabled={saving}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
