// /app/components/ProductEditModal.tsx ver.1
"use client"

import React, { useState, useEffect } from "react"
import { X } from "lucide-react"

interface ProductEditModalProps {
  isOpen: boolean
  onClose: () => void
  onUpdate: (productData: {
    id: string
    name: string
    price: number
    series_code: number
    product_code: number
    series: string
  }) => void
  product: {
    id: string
    name: string
    price: number
    series_code: number
    product_code: number
    series: string
  }
}

export default function ProductEditModal({
  isOpen,
  onClose,
  onUpdate,
  product
}: ProductEditModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    series_code: "",
    product_code: "",
    series: ""
  })

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || "",
        price: product.price?.toString() || "",
        series_code: product.series_code?.toString() || "",
        product_code: product.product_code?.toString() || "",
        series: product.series || ""
      })
    }
  }, [product])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // バリデーション
    if (!formData.name || !formData.price) {
      alert("商品名と価格は必須です")
      return
    }

    onUpdate({
      id: product.id,
      name: formData.name,
      price: parseInt(formData.price),
      series_code: parseInt(formData.series_code) || 0,
      product_code: parseInt(formData.product_code) || 0,
      series: formData.series
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">商品情報の変更</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              商品名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              価格 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              min="0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              シリーズ名
            </label>
            <input
              type="text"
              value={formData.series}
              onChange={(e) => setFormData({ ...formData, series: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                シリーズ番号
              </label>
              <input
                type="number"
                value={formData.series_code}
                onChange={(e) => setFormData({ ...formData, series_code: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                商品番号
              </label>
              <input
                type="number"
                value={formData.product_code}
                onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              更新
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
