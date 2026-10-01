// /components/WebSalesSummary.tsx
"use client"

import React from "react"

interface WebSalesSummaryProps {
  totalCount: number
  totalAmount: number | null
}

export default function WebSalesSummary({
  totalCount,
  totalAmount,
}: WebSalesSummaryProps) {
  return (
    <div className="flex justify-end gap-4 text-sm mt-4 mr-4">
      <p>合計販売数: {new Intl.NumberFormat("ja-JP").format(totalCount)}</p>
      <p>合計実売金額: {totalAmount === null ? "実売額未取得" : `¥${new Intl.NumberFormat("ja-JP").format(totalAmount)}`}</p>
    </div>
  )
}
