// /app/wholesale/oem-customers/page.tsx ver.1
"use client"

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Plus, Edit2, Trash2, Check, X, ArrowUp, ArrowDown, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Switch } from "@/components/ui/switch";

interface OEMCustomer {
  id: string;
  customer_code: string;
  customer_name: string;
  is_active: boolean;
  display_order?: number;
  created_at: string;
  updated_at: string;
}

export default function OEMCustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<OEMCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    customer_code: '',
    customer_name: '',
    is_active: true
  });
  const [editFormData, setEditFormData] = useState({
    customer_code: '',
    customer_name: '',
    is_active: true
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/wholesale/oem-customers?all=true');
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      }
    } catch (error) {
      console.error('顧客データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.customer_code.trim() || !formData.customer_name.trim()) {
      alert('顧客コードと顧客名を入力してください。');
      return;
    }

    try {
      const response = await fetch('/api/wholesale/oem-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await fetchCustomers();
        setFormData({ customer_code: '', customer_name: '', is_active: true });
        setIsAddingNew(false);
      } else {
        const error = await response.json();
        alert(`エラー: ${error.error}`);
      }
    } catch (error) {
      console.error('追加エラー:', error);
      alert('顧客の追加に失敗しました。');
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editFormData.customer_code.trim() || !editFormData.customer_name.trim()) {
      alert('顧客コードと顧客名を入力してください。');
      return;
    }

    try {
      const response = await fetch(`/api/wholesale/oem-customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });

      if (response.ok) {
        await fetchCustomers();
        setEditingId(null);
      } else {
        const error = await response.json();
        alert(`エラー: ${error.error}`);
      }
    } catch (error) {
      console.error('更新エラー:', error);
      alert('顧客の更新に失敗しました。');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この顧客を削除しますか？\n関連する売上データがある場合は削除できません。')) {
      return;
    }

    try {
      const response = await fetch(`/api/wholesale/oem-customers/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchCustomers();
      } else {
        const error = await response.json();
        alert(`エラー: ${error.error}`);
      }
    } catch (error) {
      console.error('削除エラー:', error);
      alert('顧客の削除に失敗しました。');
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const customer = customers.find(c => c.id === id);
      if (!customer) return;

      const response = await fetch(`/api/wholesale/oem-customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_code: customer.customer_code,
          customer_name: customer.customer_name,
          is_active: !currentStatus
        })
      });

      if (response.ok) {
        await fetchCustomers();
      }
    } catch (error) {
      console.error('ステータス変更エラー:', error);
    }
  };

  const handleOrderChange = async (id: string, direction: 'up' | 'down') => {
    try {
      const response = await fetch(`/api/wholesale/oem-customers/${id}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction })
      });

      if (response.ok) {
        await fetchCustomers();
      }
    } catch (error) {
      console.error('並び順変更エラー:', error);
    }
  };

  const startEdit = (customer: OEMCustomer) => {
    setEditingId(customer.id);
    setEditFormData({
      customer_code: customer.customer_code,
      customer_name: customer.customer_name,
      is_active: customer.is_active
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFormData({ customer_code: '', customer_name: '', is_active: true });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-gray-50"><p className="text-gray-500">読み込み中...</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => router.push('/wholesale/oem-sales')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              OEM売上入力に戻る
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">OEM顧客マスター管理</h1>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              OEM顧客一覧
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setIsAddingNew(true)}
              disabled={isAddingNew}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              新規追加
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr className="border-b">
                    <th className="p-3 text-left text-sm font-semibold">顧客コード</th>
                    <th className="p-3 text-left text-sm font-semibold">顧客名</th>
                    <th className="p-3 text-center text-sm font-semibold">有効</th>
                    <th className="p-3 text-center text-sm font-semibold">並び順</th>
                    <th className="p-3 text-center text-sm font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {isAddingNew && (
                    <tr className="border-b bg-blue-50">
                      <td className="p-3">
                        <Input
                          value={formData.customer_code}
                          onChange={(e) => setFormData({ ...formData, customer_code: e.target.value })}
                          placeholder="顧客コード"
                          className="w-full"
                          autoFocus
                        />
                      </td>
                      <td className="p-3">
                        <Input
                          value={formData.customer_name}
                          onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                          placeholder="顧客名"
                          className="w-full"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <Switch
                          checked={formData.is_active}
                          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                        />
                      </td>
                      <td className="p-3 text-center">-</td>
                      <td className="p-3">
                        <div className="flex justify-center gap-2">
                          <Button size="sm" onClick={handleAdd}>
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setIsAddingNew(false);
                              setFormData({ customer_code: '', customer_name: '', is_active: true });
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {customers.map((customer, index) => (
                    <tr key={customer.id} className="border-b hover:bg-gray-50">
                      {editingId === customer.id ? (
                        <>
                          <td className="p-3">
                            <Input
                              value={editFormData.customer_code}
                              onChange={(e) => setEditFormData({ ...editFormData, customer_code: e.target.value })}
                              className="w-full"
                            />
                          </td>
                          <td className="p-3">
                            <Input
                              value={editFormData.customer_name}
                              onChange={(e) => setEditFormData({ ...editFormData, customer_name: e.target.value })}
                              className="w-full"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <Switch
                              checked={editFormData.is_active}
                              onCheckedChange={(checked) => setEditFormData({ ...editFormData, is_active: checked })}
                            />
                          </td>
                          <td className="p-3 text-center">-</td>
                          <td className="p-3">
                            <div className="flex justify-center gap-2">
                              <Button size="sm" onClick={() => handleUpdate(customer.id)}>
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEdit}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 text-sm">{customer.customer_code}</td>
                          <td className="p-3 text-sm font-medium">{customer.customer_name}</td>
                          <td className="p-3 text-center">
                            <Switch
                              checked={customer.is_active}
                              onCheckedChange={() => handleToggleActive(customer.id, customer.is_active)}
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOrderChange(customer.id, 'up')}
                                disabled={index === 0}
                              >
                                <ArrowUp className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOrderChange(customer.id, 'down')}
                                disabled={index === customers.length - 1}
                              >
                                <ArrowDown className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex justify-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEdit(customer)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(customer.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {customers.length === 0 && !isAddingNew && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500">
                        顧客データがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
