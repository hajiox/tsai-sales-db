// /utils/webSalesUtils.tsx ver.2 (TikTok対応版)

import { WebSalesData } from "@/types/db"

export const calculateTotalAllECSites = (
  filteredItems: WebSalesData[],
  productMap: Map<string, any>
) => {
  return filteredItems.reduce((totalSum, item) => {
    const totalCount = 
      (item.amazon_count || 0) +
      (item.rakuten_count || 0) +
      (item.yahoo_count || 0) +
      (item.mercari_count || 0) +
      (item.base_count || 0) +
      (item.qoo10_count || 0) +
      (item.tiktok_count || 0)
    
    const price = productMap.get(item.product_id)?.price || 0
    const amount = totalCount * price
    
    return {
      totalCount: totalSum.totalCount + totalCount,
      totalAmount: totalSum.totalAmount + amount
    }
  }, { totalCount: 0, totalAmount: 0 })
}

export const sortWebSalesData = (data: WebSalesData[]) => {
  return [...data].sort((a, b) => {
    const seriesCodeA = a.series_code || 0
    const seriesCodeB = b.series_code || 0
    if (seriesCodeA !== seriesCodeB) {
      return seriesCodeA - seriesCodeB
    }
    const productCodeA = a.product_code || 0
    const productCodeB = b.product_code || 0
    return productCodeA - productCodeB
  })
}

export const filterWebSalesData = (
  data: WebSalesData[],
  filterValue: string
) => {
  if (!filterValue) return data
  
  return data.filter((item) =>
    item.product_name
      ?.toLowerCase()
      .includes(filterValue.toLowerCase())
  )
}
