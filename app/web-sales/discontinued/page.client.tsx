// app/web-sales/discontinued/page.client.tsx
"use client"

import React, { useState, useEffect } from "react"

interface HiddenProduct {
    id: string
    name: string
    price: number | null
    profit_rate: number | null
    series: string | null
    is_hidden: boolean
}

export default function DiscontinuedClient() {
    const [products, setProducts] = useState<HiddenProduct[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchHiddenProducts()
    }, [])

    const fetchHiddenProducts = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/products/hide?list=true")
            if (!res.ok) throw new Error("取得失敗")
            const data = await res.json()
            setProducts(data || [])
        } catch (error) {
            console.error("Error:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleRestore = async (productId: string) => {
        const product = products.find((p) => p.id === productId)
        if (!product) return
        if (!confirm(`「${product.name}」を復活させますか？`)) return

        try {
            const res = await fetch("/api/products/hide", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId, isHidden: false }),
            })
            if (!res.ok) throw new Error("復活に失敗しました")
            setProducts((prev) => prev.filter((p) => p.id !== productId))
        } catch (error: any) {
            alert(error.message)
        }
    }

    const handleDelete = async (productId: string) => {
        const product = products.find((p) => p.id === productId)
        if (!product) return
        if (!confirm(`「${product.name}」を完全に削除しますか？\n\n⚠ 関連する販売データも削除されます。`)) return

        try {
            const res = await fetch("/api/products/hide", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId }),
            })
            if (!res.ok) throw new Error("削除に失敗しました")
            setProducts((prev) => prev.filter((p) => p.id !== productId))
        } catch (error: any) {
            alert(error.message)
        }
    }

    return (
        <div className="p-8">
            <div className="max-w-[1000px] mx-auto">
                <div className="mb-6">
                    <a href="/web-sales/dashboard" className="text-sm text-gray-500 hover:text-gray-800">
                        ← ダッシュボードに戻る
                    </a>
                    <h1 className="text-2xl font-bold text-gray-900 mt-2">終売商品管理</h1>
                    <p className="text-gray-500 mt-1">非表示にした商品の一覧です。復活させるとダッシュボードに再表示されます。</p>
                </div>

                <div className="mb-4 text-sm text-gray-600">
                    終売商品数: <strong>{products.length}</strong> 件
                    <button
                        onClick={fetchHiddenProducts}
                        className="ml-4 px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 text-xs"
                    >
                        更新
                    </button>
                </div>

                {loading ? (
                    <div className="text-center py-12 text-gray-400">読み込み中...</div>
                ) : products.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <p className="text-lg">終売商品はありません</p>
                    </div>
                ) : (
                    <div className="border border-gray-300 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">商品名</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">シリーズ</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">価格</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">利益率</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">操作</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {products.map((product) => (
                                    <tr key={product.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm">{product.name}</td>
                                        <td className="px-4 py-3 text-sm text-center text-gray-600">{product.series || "-"}</td>
                                        <td className="px-4 py-3 text-sm text-center">
                                            {product.price ? `¥${product.price.toLocaleString()}` : "-"}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-center">
                                            {product.profit_rate != null ? `${product.profit_rate}%` : "-"}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleRestore(product.id)}
                                                    className="px-3 py-1 text-sm text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100"
                                                >
                                                    復活
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(product.id)}
                                                    className="px-3 py-1 text-sm text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100"
                                                >
                                                    完全削除
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
