// /components/WebSalesImportButtons.tsx ver.7
// TikTok追加版

"use client"

import React from "react"
import { getVisibleEcChannels, isEcChannelOperational } from "@/lib/ec-channel-lifecycle"

interface WebSalesImportButtonsProps {
  month?: string
  isUploading: boolean
  onCsvClick: () => void
  onAmazonClick: () => void
  onRakutenClick: () => void
  onYahooClick: () => void
  onMercariClick: () => void
  onBaseClick: () => void
  onQoo10Click: () => void
  onTiktokClick: () => void  // 🟢 TikTok追加
}

export default function WebSalesImportButtons({
  month,
  isUploading,
  onCsvClick,
  onAmazonClick,
  onRakutenClick,
  onYahooClick,
  onMercariClick,
  onBaseClick,
  onQoo10Click,
  onTiktokClick,  // 🟢 TikTok追加
}: WebSalesImportButtonsProps) {
  return (
    <div id="csv-input-section" className="p-3 border-t">
      {/* 取り込みボタン群 */}
      <div className="flex items-center justify-center gap-3">
        <span className="text-sm font-semibold text-gray-600">データ取り込み:</span>
        <button
          onClick={onCsvClick}
          className="px-3 py-1 text-xs font-semibold text-white bg-gray-700 rounded hover:bg-gray-800 disabled:bg-gray-400"
          disabled={isUploading}
        >
          {isUploading ? '処理中...' : 'CSV'}
        </button>
        <button
          onClick={onAmazonClick}
          className="px-3 py-1 text-xs font-semibold text-white bg-orange-500 rounded hover:bg-orange-600"
        >
          Amazon
        </button>
        <button
          onClick={onRakutenClick}
          className="px-3 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700"
        >
          楽天
        </button>
        <button
          onClick={onYahooClick}
          className="px-3 py-1 text-xs font-semibold text-white bg-purple-600 rounded hover:bg-purple-700"
        >
          Yahoo
        </button>
        {isEcChannelOperational("mercari", month) && (<button
          onClick={onMercariClick}
          className="px-3 py-1 text-xs font-semibold text-white bg-sky-500 rounded hover:bg-sky-600"
        >
          メルカリ
        </button>)}
        <button
          onClick={onBaseClick}
          className="px-3 py-1 text-xs font-semibold text-white bg-green-600 rounded hover:bg-green-700"
        >
          BASE
        </button>
        {isEcChannelOperational("qoo10", month) && (<button
          onClick={onQoo10Click}
          className="px-3 py-1 text-xs font-semibold text-white bg-pink-500 rounded hover:bg-pink-600"
        >
          Qoo10
        </button>)}
        {isEcChannelOperational("tiktok", month) && (<button
          onClick={onTiktokClick}  // 🟢 TikTok有効化
          className="px-3 py-1 text-xs font-semibold text-white bg-teal-500 rounded hover:bg-teal-600"
        >
          TikTok
        </button>)}
        {getVisibleEcChannels(month).includes("makeshop") && <button disabled className="rounded border border-dashed px-3 py-1 text-xs text-slate-500">makeshop 開店準備中</button>}
      </div>

      {/* ▼ 追加した注意書き */}
      <p className="mt-1 text-xs text-gray-500 text-center">
        ※ 各ECのCSV はアップロード前に <span className="font-semibold">必ず「CSV UTF-8 (カンマ区切り)」形式</span> で保存してください。
      </p>
    </div>
  );
}
