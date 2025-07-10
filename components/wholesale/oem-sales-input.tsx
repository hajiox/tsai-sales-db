// /components/wholesale/oem-sales-input.tsx ver.1
"use client"

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Plus, X } from 'lucide-react';

interface OEMProduct {
  id: string;
  product_name: string;
  price: number;
}

interface OEMCustomer {
  id: string;
  customer_name: string;
  customer_code: string;
}

interface OEMSale {
  id: string;
  product_id: string;
  customer_id: string;
  sale_date: string;
  quantity: number;
  unit_price: number;
  amount: number;
  oem_products?: {
    product_name: string;
    product_code: string;
  };
  oem_customers?: {
    customer_name: string;
    customer_code: string;
  };
}

interface OEMSalesInputProps {
  oemProducts: OEMProduct[];
  oemCustomers: OEMCustomer[];
  oemSales: OEMSale[];
  selectedYear: string;
  selectedMonth: string;
  onDataUpdate: () => void;
}

export default function OEMSalesInput({
  oemProducts,
  oemCustomers,
  oemSales,
  selectedYear,
  selectedMonth,
  onDataUpdate
}: OEMSalesInputProps) {
  const [formData, setFormData] = useState({
    productId: '',
    customerId: '',
    saleDate: new Date().toISOString().split('T')[0],
    quantity: '',
    unitPrice: ''
  });
  const [isAdding, setIsAdding] = useState(false);

  const handleFormChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // 商品選択時に単価を自動設定
    if (field === 'productId' && value) {
      const product = oemProducts.find(p => p.id === value);
      if (product) {
        setFormData(prev => ({
          ...prev,
          unitPrice: String(product.price)
        }));
      }
    }
  };

  const handleSubmit = async () => {
    const { productId, customerId, saleDate, quantity, unitPrice } = formData;
    
    if (!productId || !customerId || !saleDate || !quantity || !unitPrice) {
      alert('全ての項目を入力してください。');
      return;
    }

    setIsAdding(true);
    try {
      const response = await fetch('/api/wholesale/oem-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          customerId,
          saleDate,
          quantity: parseInt(quantity),
          unitPrice: parseInt(unitPrice)
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // フォームをリセット
        setFormData({
          productId: '',
          customerId: '',
          saleDate: formData.saleDate, // 日付は維持
          quantity: '',
          unitPrice: ''
        });
        // データ更新を通知
        onDataUpdate();
      } else {
        alert(`エラーが発生しました: ${result.error}`);
      }
    } catch (error) {
      console.error('OEM登録エラー:', error);
      alert('登録中にエラーが発生しました。');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このデータを削除しますか？')) {
      return;
    }

    try {
      const response = await fetch(`/api/wholesale/oem-sales?id=${id}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        onDataUpdate();
      } else {
        alert(`エラーが発生しました: ${result.error}`);
      }
    } catch (error) {
      console.error('OEM削除エラー:', error);
      alert('削除中にエラーが発生しました。');
    }
  };

  const calculateAmount = () => {
    return (parseInt(formData.unitPrice) || 0) * (parseInt(formData.quantity) || 0);
  };

  return (
    <Card className="flex-shrink-0">
      <CardHeader className="py-2 px-4 border-b">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Package className="w-4 h-4" /> OEM商品売上入力
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {/* 入力フォーム */}
        <div className="flex items-end gap-2 mb-4">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1">商品名</label>
            <select
              value={formData.productId}
              onChange={(e) => handleFormChange('productId', e.target.value)}
              className="w-full h-8 px-2 text-sm rounded-md border border-input bg-background"
            >
              <option value="">選択してください</option>
              {oemProducts.map(product => (
                <option key={product.id} value={product.id}>
                  {product.product_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1">発注者</label>
            <select
              value={formData.customerId}
              onChange={(e) => handleFormChange('customerId', e.target.value)}
              className="w-full h-8 px-2 text-sm rounded-md border border-input bg-background"
            >
              <option value="">選択してください</option>
              {oemCustomers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.customer_name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label className="block text-xs font-medium mb-1">日付</label>
            <input
              type="date"
              value={formData.saleDate}
              onChange={(e) => handleFormChange('saleDate', e.target.value)}
              className="w-full h-8 px-2 text-sm rounded-md border border-input bg-background"
            />
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium mb-1">単価</label>
            <input
              type="number"
              value={formData.unitPrice}
              onChange={(e) => handleFormChange('unitPrice', e.target.value)}
              className="w-full h-8 px-2 text-sm rounded-md border border-input bg-background"
              placeholder="¥"
            />
          </div>
          <div className="w-20">
            <label className="block text-xs font-medium mb-1">個数</label>
            <input
              type="number"
              value={formData.quantity}
              onChange={(e) => handleFormChange('quantity', e.target.value)}
              className="w-full h-8 px-2 text-sm rounded-md border border-input bg-background"
              placeholder="0"
            />
          </div>
          <div className="w-28 text-right">
            <label className="block text-xs font-medium mb-1">合計金額</label>
            <div className="h-8 px-2 py-1 text-sm font-semibold text-green-600">
              ¥{calculateAmount().toLocaleString()}
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isAdding}
            className="flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            {isAdding ? '登録中...' : '登録'}
          </Button>
        </div>

        {/* OEM売上一覧 */}
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-100">
              <tr className="border-b">
                <th className="p-2 text-left font-semibold">日付</th>
                <th className="p-2 text-left font-semibold">商品名</th>
                <th className="p-2 text-left font-semibold">発注者</th>
                <th className="p-2 text-right font-semibold">単価</th>
                <th className="p-2 text-right font-semibold">個数</th>
                <th className="p-2 text-right font-semibold">金額</th>
                <th className="p-2 text-center font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {oemSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-gray-500">
                    データがありません
                  </td>
                </tr>
              ) : (
                oemSales.map(sale => (
                  <tr key={sale.id} className="border-b hover:bg-gray-50">
                    <td className="p-2">{sale.sale_date}</td>
                    <td className="p-2">{sale.oem_products?.product_name}</td>
                    <td className="p-2">{sale.oem_customers?.customer_name}</td>
                    <td className="p-2 text-right">¥{sale.unit_price.toLocaleString()}</td>
                    <td className="p-2 text-right">{sale.quantity}</td>
                    <td className="p-2 text-right font-semibold text-green-600">
                      ¥{sale.amount.toLocaleString()}
                    </td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => handleDelete(sale.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
