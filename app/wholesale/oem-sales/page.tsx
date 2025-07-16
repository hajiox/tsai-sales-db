// /app/wholesale/oem-sales/page.tsx ver.9 コンポーネント分割・エラー修正版
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Plus } from 'lucide-react'
import { SearchableSelect } from '@/components/wholesale/searchable-select'
import { OEMProductDialog } from '@/components/wholesale/oem-product-dialog'
import { OEMCustomerDialog } from '@/components/wholesale/oem-customer-dialog'
import { OEMSalesTable } from '@/components/wholesale/oem-sales-table'

interface OEMProduct {
  id: string
  product_code: string
  product_name: string
  price: number
  is_active: boolean
}

interface OEMCustomer {
  id: string
  customer_code: string
  customer_name: string
  is_active: boolean
}

interface OEMSale {
  id: string
  product_id: string
  customer_id: string
  sale_date: string
  quantity: number
  unit_price: number
  amount: number
  product_name?: string
  customer_name?: string
}

// メインコンポーネント
function OEMSalesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [products, setProducts] = useState<OEMProduct[]>([])
  const [customers, setCustomers] = useState<OEMCustomer[]>([])
  const [sales, setSales] = useState<OEMSale[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [error, setError] = useState<string | null>(null)
  
  // ダイアログの状態
  const [showProductDialog, setShowProductDialog] = useState(false)
  const [showCustomerDialog, setShowCustomerDialog] = useState(false)
  
  // フォームの状態
  const [formData, setFormData] = useState({
    productId: '',
    customerId: '',
    unitPrice: '',
    quantity: '',
    amount: 0
  })

  // URLパラメータから年月を取得
  const currentYear = searchParams.get('year') || new Date().getFullYear().toString()
  const currentMonth = searchParams.get('month') || String(new Date().getMonth() + 1).padStart(2, '0')

  useEffect(() => {
    const month = `${currentYear}-${currentMonth}`
    setSelectedMonth(month)
    fetchInitialData(month)
  }, [currentYear, currentMonth])

  // 商品選択時の処理
  useEffect(() => {
    if (formData.productId) {
      const product = products.find(p => p.id === formData.productId)
      if (product) {
        setFormData(prev => ({
          ...prev,
          unitPrice: product.price.toString()
        }))
      }
    }
  }, [formData.productId, products])

  // 金額自動計算
  useEffect(() => {
    const price = parseInt(formData.unitPrice) || 0
    const qty = parseInt(formData.quantity) || 0
    setFormData(prev => ({
      ...prev,
      amount: price * qty
    }))
  }, [formData.unitPrice, formData.quantity])

  const fetchInitialData = async (month: string) => {
    try {
      setIsLoading(true)
      
      const [productsRes, customersRes, salesRes] = await Promise.all([
        fetch('/api/wholesale/oem-products'),
        fetch('/api/wholesale/oem-customers?all=true'),
        fetch(`/api/wholesale/oem-sales?month=${month}`)
      ])

      if (!productsRes.ok || !customersRes.ok || !salesRes.ok) {
        throw new Error('データの取得に失敗しました')
      }

      const productsData = await productsRes.json()
      const customersData = await customersRes.json()
      const salesData = await salesRes.json()

      setProducts(productsData.filter((p: OEMProduct) => p.is_active))
      setCustomers(customersData.customers?.filter((c: OEMCustomer) => c.is_active) || [])
      setSales(salesData.sales || [])
    } catch (error) {
      console.error('Error fetching data:', error)
      setError('データの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddProduct = async (productName: string, productPrice: string) => {
    try {
      const response = await fetch('/api/wholesale/oem-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName,
          price: parseInt(productPrice)
        })
      })

      if (!response.ok) throw new Error('商品の登録に失敗しました')

      const newProduct = await response.json()
      
      // 商品リストを再取得して確実に最新データを反映
      await fetchProducts()
      
      // 少し遅延を入れて状態更新を確実に
      setTimeout(() => {
        setFormData(prev => ({
          ...prev,
          productId: newProduct.id,
          unitPrice: newProduct.price.toString()
        }))
      }, 100)
      
      setError(null)
    } catch (error) {
      setError('商品の登録に失敗しました')
      throw error
    }
  }

  const handleAddCustomer = async (customerName: string) => {
    try {
      const response = await fetch('/api/wholesale/oem-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName
        })
      })

      if (!response.ok) throw new Error('顧客の登録に失敗しました')

      const newCustomer = await response.json()
      
      // 顧客リストを再取得して確実に最新データを反映
      await fetchCustomers()
      
      // 少し遅延を入れて状態更新を確実に
      setTimeout(() => {
        setFormData(prev => ({
          ...prev,
          customerId: newCustomer.id
        }))
      }, 100)
      
      setError(null)
    } catch (error) {
      setError('顧客の登録に失敗しました')
      throw error
    }
  }

  const fetchProducts = async () => {
    const response = await fetch('/api/wholesale/oem-products')
    const data = await response.json()
    setProducts(data.filter((p: OEMProduct) => p.is_active))
  }

  const fetchCustomers = async () => {
    const response = await fetch('/api/wholesale/oem-customers?all=true')
    const data = await response.json()
    setCustomers(data.customers?.filter((c: OEMCustomer) => c.is_active) || [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // デバッグ用ログ
    console.log('Form submission - formData:', formData)
    console.log('productId:', formData.productId, '- type:', typeof formData.productId)
    console.log('customerId:', formData.customerId, '- type:', typeof formData.customerId)
    console.log('quantity:', formData.quantity, '- type:', typeof formData.quantity)

    // より詳細な検証
    const hasProduct = formData.productId && formData.productId.trim() !== ''
    const hasCustomer = formData.customerId && formData.customerId.trim() !== ''
    const hasQuantity = formData.quantity && formData.quantity.trim() !== '' && formData.quantity !== '0'

    console.log('Validation results:', { hasProduct, hasCustomer, hasQuantity })

    if (!hasProduct || !hasCustomer || !hasQuantity) {
      setError('すべての項目を入力してください')
      return
    }

    try {
      const saleDate = `${selectedMonth}-01`
      
      const response = await fetch('/api/wholesale/oem-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: formData.productId,
          customer_id: formData.customerId,
          sale_date: saleDate,
          quantity: parseInt(formData.quantity),
          unit_price: parseInt(formData.unitPrice)
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '登録に失敗しました')
      }

      // フォームをリセット
      setFormData({
        productId: '',
        customerId: '',
        unitPrice: '',
        quantity: '',
        amount: 0
      })
      
      // 売上一覧を再取得
      fetchInitialData(selectedMonth)
    } catch (error) {
      setError(error instanceof Error ? error.message : '登録に失敗しました')
    }
  }

  const handleDelete = async (saleId: string) => {
    if (!confirm('この売上データを削除しますか？')) return

    try {
      const response = await fetch(`/api/wholesale/oem-sales?id=${saleId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('削除に失敗しました')
      }

      fetchInitialData(selectedMonth)
    } catch (error) {
      setError('削除に失敗しました')
    }
  }

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = e.target.value
    setSelectedMonth(newMonth)
    fetchInitialData(newMonth)
  }

  const handleBackToDashboard = () => {
    router.push(`/wholesale/dashboard?year=${currentYear}&month=${currentMonth}`)
  }

  const handleCustomerManagement = () => {
    router.push(`/wholesale/oem-customers?year=${currentYear}&month=${currentMonth}`)
  }

  if (isLoading) {
    return <div className="p-6">読み込み中...</div>
  }

  // 売上データに商品名と顧客名を結合
  const salesWithDetails = sales.map(sale => ({
    ...sale,
    product_name: products.find(p => p.id === sale.product_id)?.product_name || '不明',
    customer_name: customers.find(c => c.id === sale.customer_id)?.customer_name || '不明'
  }))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleBackToDashboard}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          ダッシュボードに戻る
        </Button>
        <h1 className="text-2xl font-semibold">OEM売上入力</h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* デバッグ情報 */}
      <div className="mb-4 p-4 bg-gray-100 border border-gray-300 rounded text-sm">
        <p><strong>デバッグ情報:</strong></p>
        <p>商品ID: {formData.productId || '未選択'}</p>
        <p>顧客ID: {formData.customerId || '未選択'}</p>
        <p>単価: {formData.unitPrice || '未入力'}</p>
        <p>個数: {formData.quantity || '未入力'}</p>
        <p>合計: {formData.amount}</p>
      </div>

      {/* 入力フォーム */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>売上データ入力</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="product">商品名</Label>
                <SearchableSelect
                  options={products}
                  value={formData.productId}
                  onChange={(value) => {
                    console.log('Product selected:', value)
                    setFormData(prev => ({ ...prev, productId: value }))
                  }}
                  placeholder="商品を検索..."
                  displayKey="product_name"
                  valueKey="id"
                  onAddNew={() => setShowProductDialog(true)}
                  addNewLabel="新規商品を登録"
                />
              </div>
              
              <div>
                <Label htmlFor="customer">発注者</Label>
                <SearchableSelect
                  options={customers}
                  value={formData.customerId}
                  onChange={(value) => {
                    console.log('Customer selected:', value)
                    setFormData(prev => ({ ...prev, customerId: value }))
                  }}
                  placeholder="発注者を検索..."
                  displayKey="customer_name"
                  valueKey="id"
                  onAddNew={() => setShowCustomerDialog(true)}
                  addNewLabel="新規顧客を登録"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="unitPrice">単価</Label>
                <Input
                  id="unitPrice"
                  type="number"
                  value={formData.unitPrice}
                  onChange={(e) => setFormData(prev => ({ ...prev, unitPrice: e.target.value }))}
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="quantity">個数</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                  required
                />
              </div>
              
              <div>
                <Label>合計金額</Label>
                <div className="h-10 px-3 py-2 bg-gray-50 border rounded-md flex items-center">
                  ¥{formData.amount.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit">
                <Plus className="h-4 w-4 mr-2" />
                登録
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCustomerManagement}
              >
                顧客管理
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 売上一覧 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>登録済み売上データ</CardTitle>
          <div>
            <Label htmlFor="month-filter" className="sr-only">月選択</Label>
            <select
              id="month-filter"
              value={selectedMonth}
              onChange={handleMonthChange}
              className="px-3 py-1 border rounded-md"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const date = new Date()
                date.setMonth(date.getMonth() - i)
                const value = date.toISOString().slice(0, 7)
                const label = `${date.getFullYear()}年${date.getMonth() + 1}月`
                return <option key={value} value={value}>{label}</option>
              })}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <OEMSalesTable 
            sales={salesWithDetails} 
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>

      {/* 商品登録ダイアログ */}
      <OEMProductDialog
        open={showProductDialog}
        onOpenChange={setShowProductDialog}
        onSubmit={handleAddProduct}
      />

      {/* 顧客登録ダイアログ */}
      <OEMCustomerDialog
        open={showCustomerDialog}
        onOpenChange={setShowCustomerDialog}
        onSubmit={handleAddCustomer}
      />
    </div>
  )
}

// Suspenseでラップしたメインコンポーネント
export default function OEMSalesPage() {
  return (
    <Suspense fallback={<div className="p-6">読み込み中...</div>}>
      <OEMSalesContent />
    </Suspense>
  )
}
