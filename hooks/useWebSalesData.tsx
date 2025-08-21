// /hooks/useWebSalesData.tsx
"use client"

import { useState, useEffect } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import { WebSalesData, Product } from "@/types/db"

export function useWebSalesData(initialData: WebSalesData[], month: string) {
  const supabase = getSupabaseBrowserClient()
  const [data, setData] = useState<WebSalesData[]>(initialData)
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map())
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const fetchProducts = async () => {
      const { data: products, error } = await supabase
        .from("products")
        .select("*")
      if (error) {
        console.error("Error fetching products:", error)
        return
      }
      const map = new Map<string, Product>()
      products.forEach((p) => map.set(p.id, p))
      setProductMap(map)
    }
    fetchProducts()
  }, [])

  useEffect(() => {
    setData(initialData)
  }, [initialData])

  const getProductName = (productId: string) => {
    return productMap.get(productId)?.name || "不明な商品"
  }

  const getProductSeriesCode = (productId: string) => {
    return productMap.get(productId)?.series_code || 9999
  }

  const getProductNumber = (productId: string) => {
    return productMap.get(productId)?.product_number || 9999
  }

  const getProductPrice = (productId: string) => {
    return productMap.get(productId)?.price || 0
  }

  const handleDeleteMonthData = async (currentMonth: string, router: any) => {
    if (
      !window.confirm(
        `${currentMonth}のすべての売上データを削除します。本当によろしいですか？`,
      )
    ) {
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase
        .from("web_sales_summary")
        .delete()
        .eq("report_month", currentMonth + "-01")
      if (error) {
        console.error("Error deleting month data:", error)
        alert("月別データの削除に失敗しました。")
      } else {
        alert(`${currentMonth}の売上データが正常に削除されました。`)
        setData([])
        router.refresh()
      }
    } catch (error) {
      console.error("Error during delete operation:", error)
      alert("月別データの削除中にエラーが発生しました。")
    } finally {
      setIsLoading(false)
    }
  }

  return {
    data,
    setData,
    productMap,
    isLoading,
    getProductName,
    getProductSeriesCode,
    getProductNumber,
    getProductPrice,
    handleDeleteMonthData,
  }
}
