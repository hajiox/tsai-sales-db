// /app/wholesale/oem-customers/page.tsx ver.4 自動採番対応版
"use client"

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Users, Plus, ChevronLeft, ChevronUp, ChevronDown, Edit2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface OEMCustomer {
  id: string;
  customer_code: string;
  customer_name: string;
  is_active: boolean;
  display_order: number;
}

export default function OEMCustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<OEMCustomer[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<OEMCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/wholesale/oem-customers?all=true');
      if (!response.ok) throw new Error('Failed to fetch customers');
      const data = await response.json();
      setCustomers(data.customers || []);
    } catch (error) {
      console.error('顧客データ取得エラー:', error);
      setError('顧客データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async () => {
    if (!newCustomerName) {
      setError('顧客名は必須です');
      return;
    }

    try {
      const response = await fetch('/api/wholesale/oem-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: newCustomerName
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || '顧客の追加に失敗しました');
        return;
      }
      
      await fetchCustomers();
      setIsAddModalOpen(false);
      setNewCustomerName('');
      setError('');
    } catch (error) {
      console.error('顧客追加エラー:', error);
      setError('顧客の追加に失敗しました');
    }
  };

  const handleUpdateCustomer = async () => {
    if (!editingCustomer) return;

    try {
      const response = await fetch(`/api/wholesale/oem-customers/${editingCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_code: editingCustomer.customer_code,
          customer_name: editingCustomer.customer_name,
          is_active: editingCustomer.is_active
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || '顧客の更新に失敗しました');
        return;
      }
      
      await fetchCustomers();
      setIsEditModalOpen(false);
      setEditingCustomer(null);
      setError('');
    } catch (error) {
      console.error('顧客更新エラー:', error);
      setError('顧客の更新に失敗しました');
    }
  };

  const handleDeleteCustomer = async (customer: OEMCustomer) => {
    if (!confirm(`顧客「${customer.customer_name}」を削除しますか？\n\n売上データがある場合は削除できません。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/wholesale/oem-customers/${customer.id}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.error && data.error.includes('売上データが存在')) {
          setError(`顧客「${customer.customer_name}」は売上データが存在するため削除できません`);
        } else {
          setError(data.error || '顧客の削除に失敗しました');
        }
        return;
      }
      
      await fetchCustomers();
      setError('');
    } catch (error) {
      console.error('顧客削除エラー:', error);
      setError('顧客の削除に失敗しました');
    }
  };

  const handleToggleActive = async (customer: OEMCustomer) => {
    try {
      const response = await fetch(`/api/wholesale/oem-customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_code: customer.customer_code,
          customer_name: customer.customer_name,
          is_active: !customer.is_active
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || '状態の更新に失敗しました');
        return;
      }
      
      await fetchCustomers();
      setError('');
    } catch (error) {
      console.error('状態切替エラー:', error);
      setError('状態の更新に失敗しました');
    }
  };

  const handleChangeOrder = async (customerId: string, direction: 'up' | 'down') => {
    try {
      const response = await fetch(`/api/wholesale/oem-customers/${customerId}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction })
      });
      
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || '並び順の変更に失敗しました');
        return;
      }
      
      await fetchCustomers();
      setError('');
    } catch (error) {
      console.error('並び順変更エラー:', error);
      setError('並び順の変更に失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push('/wholesale/dashboard')}
          className="flex items-center gap-2 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          ダッシュボードに戻る
        </Button>
        
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6" />
          OEM顧客マスター管理
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>OEM顧客一覧</CardTitle>
          <Button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            新規追加
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">顧客コード</TableHead>
                <TableHead>顧客名</TableHead>
                <TableHead className="w-24 text-center">有効</TableHead>
                <TableHead className="w-24 text-center">並び順</TableHead>
                <TableHead className="w-32 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                    顧客データがありません
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer, index) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-mono">{customer.customer_code}</TableCell>
                    <TableCell>{customer.customer_name}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={customer.is_active}
                        onCheckedChange={() => handleToggleActive(customer)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleChangeOrder(customer.id, 'up')}
                          disabled={index === 0}
                        >
                          <ChevronUp className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleChangeOrder(customer.id, 'down')}
                          disabled={index === customers.length - 1}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingCustomer(customer);
                            setIsEditModalOpen(true);
                            setError('');
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteCustomer(customer)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 新規追加モーダル */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-96">
            <CardHeader>
              <CardTitle>新規顧客追加</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="customer-name">顧客名</Label>
                <Input
                  id="customer-name"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="例: 株式会社〇〇"
                />
                <p className="text-xs text-gray-500 mt-1">
                  顧客コードは自動で採番されます
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setNewCustomerName('');
                    setError('');
                  }}
                >
                  キャンセル
                </Button>
                <Button onClick={handleAddCustomer}>
                  追加
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 編集モーダル */}
      {isEditModalOpen && editingCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-96">
            <CardHeader>
              <CardTitle>顧客編集</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>顧客コード</Label>
                <Input
                  value={editingCustomer.customer_code}
                  disabled
                  className="bg-gray-100"
                />
              </div>
              <div>
                <Label htmlFor="edit-customer-name">顧客名</Label>
                <Input
                  id="edit-customer-name"
                  value={editingCustomer.customer_name}
                  onChange={(e) => setEditingCustomer({
                    ...editingCustomer,
                    customer_name: e.target.value
                  })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingCustomer(null);
                    setError('');
                  }}
                >
                  キャンセル
                </Button>
                <Button onClick={handleUpdateCustomer}>
                  更新
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
