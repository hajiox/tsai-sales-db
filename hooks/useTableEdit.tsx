// /hooks/useTableEdit.tsx
"use client"

import { useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import { WebSalesData } from "@/types/db"

export function useTableEdit() {
  const supabase = getSupabaseBrowserClient()
  const [editMode, setEditMode] = useState<string | null>(null)
  const [editedValue, setEditedValue] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)

  const handleEdit = (
    productId: string,
    ecSite: string,
    currentValue: number | null,
  ) => {
    setEditMode(`${productId}-${ecSite}`)
    setEditedValue(currentValue?.toString() || "")
  }

  const handleSave = async (
    productId: string, 
    ecSite: string, 
    month: string,
    data: WebSalesData[],
    setData: (data: WebSalesData[]) => void,
    getProductPrice: (productId: string) => number
  ) => {
    setIsLoading(true)
    const newValue = parseInt(editedValue)

    if (isNaN(newValue)) {
      alert("有効な数値を入力してください。")
      setIsLoading(false)
      return
    }

    const updatedData = data.map((item) =>
      item.product_id === productId
        ? { ...item, [`${ecSite}_count`]: newValue }
        : item,
    )
    setData(updatedData)

    try {
      const updatePayload: any = { product_id: productId, report_month: month }
      updatePayload[`${ecSite}_count`] = newValue

      const price = getProductPrice(productId)
      if (price !== undefined) {
        updatePayload[`${ecSite}_amount`] = newValue * price
      }

      const { error } = await supabase
        .from("web_sales_summary")
        .upsert([updatePayload], { onConflict: "product_id, report_month" })

      if (error) {
        console.error("Error updating data:", error)
        alert("データの保存に失敗しました。")
      } else {
        console.log("Data saved successfully.")
      }
    } catch (error) {
      console.error("Error during save operation:", error)
      alert("データの保存中にエラーが発生しました。")
    } finally {
      setEditMode(null)
      setEditedValue("")
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setEditMode(null)
    setEditedValue("")
  }

  return {
    editMode,
    editedValue,
    isLoading,
    setEditedValue,
    handleEdit,
    handleSave,
    handleCancel,
  }
}
