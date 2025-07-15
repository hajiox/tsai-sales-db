// /app/wholesale/oem-customers/page.tsx ver.6
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, ChevronUp, ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react'
import { useToast } from "@/hooks/use-toast"

interface Customer {
  id: string
  customer_code: string
  customer_name: string
  is_active: boolean
  display_order: number | null
}

// メインコンポーネントを分離
function OEMCustomersContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null)
  const [formData, setFormData] = useState({
    customer_name: ''
  })

  // URLパラメータから年月を取得
  const currentYear = searchParams.get('year') || new Date().getFullYear().toString()
  const currentMonth = searchParams.get('month') || String(new Date().getMonth() + 1).padStart(2, '0')

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/wholesale/oem-customers?all=true')
      const data = await response.json()
      
      if (data.success && Array.isArray(data.customers)) {
        setCustomers(data.customers)
      } else {
        console.error('Unexpected API response format:', data)
        toast({
          title: "エラー",
          description: "顧客データの形式が正しくありません",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error fetching customers:', error)
      toast({
        title: "エラー",
        description: "顧客データの取得に失敗しました",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const url = editingCustomer 
        ? `/api/wholesale/oem-customers/${editingCustomer.id}`
        : '/api/wholesale/oem-customers'
      
      const method = editingCustomer ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        toast({
          title: "成功",
          description: editingCustomer ? "顧客を更新しました" : "顧客を追加しました",
        })
        fetchCustomers()
        handleCloseDialog()
      } else {
        throw new Error('Failed to save customer')
      }
    } catch (error) {
      console.error('Error saving customer:', error)
      toast({
        title: "エラー",
        description: "顧客の保存に失敗しました",
        variant: "destructive",
      })
    }
  }

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setFormData({
      customer_name: customer.customer_name
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteCustomer) return

    try {
      const response = await fetch(`/api/wholesale/oem-customers/${deleteCustomer.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast({
          title: "成功",
          description: "顧客を削除しました",
        })
        fetchCustomers()
      } else if (response.status === 400) {
        const data = await response.json()
        toast({
          title: "エラー",
          description: data.error || "売上データが存在するため削除できません",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error deleting customer:', error)
      toast({
        title: "エラー",
        description: "顧客の削除に失敗しました",
        variant: "destructive",
      })
    } finally {
      setIsDeleteDialogOpen(false)
      setDeleteCustomer(null)
    }
  }

  const handleToggleActive = async (customer: Customer) => {
    try {
      const response = await fetch(`/api/wholesale/oem-customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customer.customer_name,
          is_active: !customer.is_active
        }),
      })

      if (response.ok) {
        fetchCustomers()
      }
    } catch (error) {
      console.error('Error toggling active status:', error)
      toast({
        title: "エラー",
        description: "ステータスの更新に失敗しました",
        variant: "destructive",
      })
    }
  }

  const handleUpdateOrder = async (customer: Customer, direction: 'up' | 'down') => {
    try {
      const response = await fetch(`/api/wholesale/oem-customers/${customer.id}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      })

      if (response.ok) {
        fetchCustomers()
      }
    } catch (error) {
      console.error('Error updating order:', error)
      toast({
        title: "エラー",
        description: "並び順の更新に失敗しました",
        variant: "destructive",
      })
    }
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingCustomer(null)
    setFormData({ customer_name: '' })
  }

  const handleOpenDeleteDialog = (customer: Customer) => {
    setDeleteCustomer(customer)
    setIsDeleteDialogOpen(true)
  }

  const handleBackToDashboard = () => {
    // 年月パラメータを保持してダッシュボードに戻る
    router.push(`/wholesale/dashboard?year=${currentYear}&month=${currentMonth}`)
  }

  if (isLoading) {
    return <div className="p-6">読み込み中...</div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleBackToDashboard}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          ダッシュボードに戻る
        </Button>
        <h1 className="text-2xl font-semibold">OEM顧客管理</h1>
      </div>

      <div className="mb-4">
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          新規顧客追加
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">並び順</TableHead>
              <TableHead className="w-[150px]">顧客コード</TableHead>
              <TableHead>顧客名</TableHead>
              <TableHead className="w-[100px]">有効</TableHead>
              <TableHead className="w-[150px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer, index) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUpdateOrder(customer, 'up')}
                      disabled={index === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUpdateOrder(customer, 'down')}
                      disabled={index === customers.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="font-mono">{customer.customer_code}</TableCell>
                <TableCell>{customer.customer_name}</TableCell>
                <TableCell>
                  <Switch
                    checked={customer.is_active}
                    onCheckedChange={() => handleToggleActive(customer)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(customer)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDeleteDialog(customer)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? '顧客編集' : '新規顧客追加'}
            </DialogTitle>
            <DialogDescription>
              {editingCustomer 
                ? '顧客名を編集できます。顧客コードは変更できません。'
                : '顧客名を入力してください。顧客コードは自動で採番されます。'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {editingCustomer && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">顧客コード</Label>
                  <div className="col-span-3 font-mono text-sm">
                    {editingCustomer.customer_code}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="customer_name" className="text-right">
                  顧客名
                </Label>
                <Input
                  id="customer_name"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  className="col-span-3"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                キャンセル
              </Button>
              <Button type="submit">
                {editingCustomer ? '更新' : '追加'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>顧客の削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteCustomer?.customer_name}」を削除してもよろしいですか？
              売上データが存在する場合は削除できません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteCustomer(null)}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Suspenseでラップしたメインコンポーネント
export default function OEMCustomersPage() {
  return (
    <Suspense fallback={<div className="p-6">読み込み中...</div>}>
      <OEMCustomersContent />
    </Suspense>
  )
}
