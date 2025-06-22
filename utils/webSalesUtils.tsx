// /utils/webSalesUtils.tsx

import { WebSalesData } from "@/types/db"

export const calculateTotalAllECSites = (filteredItems: WebSalesData[]) => {
  const ecSites = [
    "amazon",
    "rakuten", 
    "yahoo",
    "mercari",
    "base",
    "qoo10",
  ]
  return ecSites.reduce((totalSum, site) => {
    return totalSum + filteredItems.reduce((sum, item) => {
      const count = item[`${site}_count`] || 0
      return sum + count
    }, 0)
  }, 0)
}

export const calculateTotalAmountAllECSites = (filteredItems: WebSalesData[]) => {
  const ecSites = [
    "amazon",
    "rakuten",
    "yahoo", 
    "mercari",
    "base",
    "qoo10",
  ]
  return ecSites.reduce((totalSum, site) => {
    return totalSum + filteredItems.reduce((sum, item) => {
      const amount = item[`${site}_amount`] || 0
      return sum + amount
    }, 0)
  }, 0)
}

export const sortWebSalesData = (
  data: WebSalesData[], 
  getProductSeriesCode: (id: string) => number,
  getProductNumber: (id: string) => number
) => {
  return [...data].sort((a, b) => {
    const seriesCodeA = getProductSeriesCode(a.product_id)
    const seriesCodeB = getProductSeriesCode(b.product_id)
    if (seriesCodeA !== seriesCodeB) {
      return seriesCodeA - seriesCodeB
    }
    const productNumberA = getProductNumber(a.product_id)
    const productNumberB = getProductNumber(b.product_id)
    return productNumberA - productNumberB
  })
}

export const filterWebSalesData = (
  data: WebSalesData[],
  filterValue: string,
  getProductName: (id: string) => string
) => {
  if (!filterValue) return data
  
  return data.filter((item) =>
    getProductName(item.product_id)
      .toLowerCase()
      .includes(filterValue.toLowerCase())
  )
}
