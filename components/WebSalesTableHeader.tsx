// /components/WebSalesTableHeader.tsx ver.XX
// CSV入力へのジャンプボタン追加版

"use client"

import React from "react"
import { ChevronDown, Search, Trash2, Download } from "lucide-react"

interface WebSalesTableHeaderProps {
  currentMonth: string
  filterValue: string
  isLoading: boolean
  onMonthChange: (month: string) => void
  onFilterChange: (value: string) => void
  onDeleteMonthData: () => void
}

export default function WebSalesTableHeader({
  currentMonth,
  filterValue,
  isLoading,
  onMonthChange,
  onFilterChange,
  onDeleteMonthData,
}: WebSalesTableHeaderProps) {
  // CSV入力セクションまでスクロール
  const scrollToCsvInput = () => {
    // WebSalesImportButtons の親要素を探してスクロール
    const csvInputSection = document.querySelector('[data-csv-input-section]')
    if (csvInputSection) {
      csvInputSection.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      })
    }
  }

  return (
    <div className="flex items-center justify-between mb-4 p-4 bg-white border rounded-lg shadow-sm">
      <div className="flex items-center space-x-4">
        <h1 className="text-xl font-bold text-gray-900">
          WEB販売実績 ({currentMonth})
        </h1>
        
        {/* 🆕 CSV入力へボタン */}
        <button
          onClick={scrollToCsvInput}
          className="px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
        >
          📊 CSV入力へ
        </button>
      </div>

      <div className="flex items-center space-x-4">
        {/* 月選択 */}
        <div className="relative">
          <select
            value={currentMonth}
            onChange={(e) => onMonthChange(e.target.value)}
            disabled={isLoading}
            className="appearance-none bg-white border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          >
            <option value="2025-01">2025年01月</option>
            <option value="2025-02">2025年02月</option>
            <option value="2025-03">2025年03月</option>
            <option value="2025-04">2025年04月</option>
            <option value="2025-05">2025年05月</option>
            <option value="2025-06">2025年06月</option>
            <option value="2025-07">2025年07月</option>
            <option value="2025-08">2025年08月</option>
            <option value="2025-09">2025年09月</option>
            <option value="2025-10">2025年10月</option>
            <option value="2025-11">2025年11月</option>
            <option value="2025-12">2025年12月</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        {/* 商品名検索 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="商品名で検索"
            value={filterValue}
            onChange={(e) => onFilterChange(e.target.value)}
            disabled={isLoading}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          />
        </div>

        {/* データ削除ボタン */}
        <button
          onClick={onDeleteMonthData}
          disabled={isLoading}
          className="inline-flex items-center px-3 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          {currentMonth} データ削除
        </button>
      </div>
    </div>
  )
}
