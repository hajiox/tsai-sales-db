// /components/WebSalesDataTable.tsx ver.4 (縞々表示・商品管理機能付き)
"use client"

import React, { useState } from "react"
import { Input } from "@nextui-org/react"
import { WebSalesData } from "@/types/db"
import { Plus, Trash2 } from "lucide-react"
import ProductAddModal from "./ProductAddModal"

interface WebSalesDataTableProps {
  filteredItems: WebSalesData[]
  editMode: string | null
  editedValue: string
  getProductName: (productId: string) => string
  getProductPrice: (productId: string) => number
  onEdit: (productId: string, ecSite: string, currentValue: number | null) => void
  onSave: (productId: string, ecSite: string) => void
  onEditValueChange: (value: string) => void
  onCancel: () => void
  productMaster?: any[]
  onRefresh?: () => void
}

export default function WebSalesDataTable({
  filteredItems,
  editMode,
  editedValue,
  getProductName,
  getProductPrice,
  onEdit,
  onSave,
  onEditValueChange,
  onCancel,
  productMaster = [],
  onRefresh,
}: WebSalesDataTableProps) {
  const [isAddingProduct, setIsAddingProduct] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // 🔥 商品追加処理
  const handleAddProduct = async (productData: { 
    productName: string; 
    price: number; 
    seriesNumber: number; 
    productNumber: number; 
    seriesName: string 
  }) => {
    try {
      const response = await fetch('/api/products/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: productData.productName,
          price: productData.price,
          series_code: productData.seriesNumber,
          product_code: productData.productNumber,
          series: productData.seriesName
        }),
      });
      
      if (!response.ok) throw new Error('商品追加に失敗しました');
      
      setIsAddingProduct(false);
      onRefresh?.();
      alert('商品を追加しました');
    } catch (error) {
      console.error('商品追加エラー:', error);
      alert('商品追加に失敗しました');
    }
  };

  // 🔥 商品削除処理
  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (!confirm(`商品「${productName}」を削除しますか？\nこの操作は取り消せません。`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/products/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId }),
      });

      if (!response.ok) {
        throw new Error('商品削除に失敗しました');
      }

      onRefresh?.();
      alert('商品を削除しました');
    } catch (error) {
      console.error('商品削除エラー:', error);
      alert('商品削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
        <h3 className="text-lg font-semibold">全商品一覧 ({filteredItems.length}商品)</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setIsAddingProduct(true)}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            商品登録
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-52">
                商品名
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Amazon
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                楽天
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Yahoo!
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                メルカリ
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                BASE
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Qoo10
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                合計数
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                合計金額
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                削除
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                  データがありません
                </td>
              </tr>
            ) : (
              filteredItems.map((row, index) => {
                const productPrice = getProductPrice(row.product_id)
                const totalCount = [
                  "amazon",
                  "rakuten", 
                  "yahoo",
                  "mercari",
                  "base",
                  "qoo10",
                ].reduce((sum, site) => sum + (row[`${site}_count`] || 0), 0)
                const totalAmount = totalCount * productPrice

                return (
                  <tr 
                    key={row.product_id}
                    className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    <td className="px-4 py-4 text-left text-xs">
                      <div>{getProductName(row.product_id)}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        単価: ¥{new Intl.NumberFormat("ja-JP").format(productPrice)}
                      </div>
                    </td>
                    {(
                      [
                        "amazon",
                        "rakuten",
                        "yahoo", 
                        "mercari",
                        "base",
                        "qoo10",
                      ] as const
                    ).map((site) => {
                      const cellKey = `${row.product_id}-${site}`
                      const count = row[`${site}_count`] || 0
                      const displayValue = `${count}`
                      return (
                        <td key={cellKey} className="px-4 py-4 text-center">
                          <div
                            onClick={() => onEdit(row.product_id, site, count)}
                            className={`cursor-pointer hover:bg-gray-100 p-1 rounded ${
                              editMode === cellKey ? "bg-blue-50" : ""
                            }`}
                          >
                            {editMode === cellKey ? (
                              <Input
                                autoFocus
                                value={editedValue}
                                onChange={(e) => onEditValueChange(e.target.value)}
                                onBlur={() => onSave(row.product_id, site)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    onSave(row.product_id, site)
                                  } else if (e.key === "Escape") {
                                    onCancel()
                                  }
                                }}
                                type="number"
                                className="text-center"
                                size="sm"
                              />
                            ) : (
                              displayValue
                            )}
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-4 py-4 text-center font-bold">
                      {new Intl.NumberFormat("ja-JP").format(totalCount)}
                    </td>
                    <td className="px-4 py-4 text-center font-bold">
                      ¥{new Intl.NumberFormat("ja-JP").format(totalAmount)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => handleDeleteProduct(row.product_id, getProductName(row.product_id))}
                        disabled={isDeleting}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        削除
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 🔥 商品追加モーダル */}
      {isAddingProduct && (
        <ProductAddModal
          isOpen={isAddingProduct}
          onClose={() => setIsAddingProduct(false)}
          onAdd={handleAddProduct}
          existingProducts={productMaster.map(p => ({
            seriesNumber: p.series_code,
            productNumber: p.product_code,
            name: p.name,
            seriesName: p.series
          }))}
        />
      )}
    </div>
  )
}
