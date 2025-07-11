// /app/wholesale/oem-sales/page.tsx ver.3 API形式対応修正版
"use client"

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Plus, X, ArrowLeft, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';

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

export default function OEMSalesPage() {
  const router = useRouter();
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [monthOptions, setMonthOptions] = useState<string[]>([]);
  const [oemProducts, setOemProducts] = useState<OEMProduct[]>([]);
  const [oemCustomers, setOemCustomers] = useState<OEMCustomer[]>([]);
  const [oemSales, setOemSales] = useState<OEMSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [formData, setFormData] = useState({
    productId: '',
    customerId: '',
    saleDate: new Date().toISOString().split('T')[0],
    quantity: '',
    unitPrice: ''
  });
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const now = new Date();
    
    // 年のオプション（過去3年分）
    const years: string[] = [];
    for (let i = 0; i < 3; i++) {
      years.push(String(now.getFullYear() - i));
    }
    setYearOptions(years);
    setSelectedYear(String(now.getFullYear()));
    
    // 月のオプション
    const months: string[] = [];
    for (let i = 1; i <= 12; i++) {
      months.push(String(i).padStart(2, '0'));
    }
    setMonthOptions(months);
    setSelectedMonth(String(now.getMonth() + 1).padStart(2, '0'));
  }, [mounted]);

  useEffect(() => {
    if (!selectedYear || !selectedMonth || !mounted) return;
    const fetchAllData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchOemProducts(),
          fetchOemCustomers(),
          fetchOemSalesData(`${selectedYear}-${selectedMonth}`)
        ]);
      } catch (error) {
        console.error('データ取得エラー:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAllData();
  }, [selectedYear, selectedMonth, mounted]);

  const fetchOemProducts = async () => {
    try {
      const response = await fetch('/api/wholesale/oem-products');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setOemProducts(data);
        }
      }
    } catch (error) {
      console.error('OEM商品データ取得エラー:', error);
    }
  };

  const fetchOemCustomers = async () => {
    try {
      const response = await fetch('/api/wholesale/oem-customers');
      if (response.ok) {
        const data = await response.json();
        // APIレスポンス形式に対応
        if (data.success && Array.isArray(data.customers)) {
          setOemCustomers(data.customers);
        }
      }
    } catch (error) {
      console.error('OEM顧客データ取得エラー:', error);
    }
  };

  const fetchOemSalesData = async (month: string) => {
    try {
      const response = await fetch(`/api/wholesale/oem-sales?month=${month}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.sales)) {
          setOemSales(data.sales);
        } else {
          setOemSales([]);
        }
      }
    } catch (error) {
      console.error('OEM売上データ取得エラー:', error);
      setOemSales([]);
    }
  };

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
        // データ再取得
        await fetchOemSalesData(`${selectedYear}-${selectedMonth}`);
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
        await fetchOemSalesData(`${selectedYear}-${selectedMonth}`);
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

  // 月合計の計算
  const monthlyTotal = oemSales.reduce((sum, sale) => sum + sale.amount, 0);

  if (!mounted) {
    return <div className="flex items-center justify-center h-screen bg-gray-50"><p className="text-gray-500">ページを準備しています...</p></div>;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="flex-shrink-0 bg-white shadow-sm border-b z-30">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => router.push('/wholesale/dashboard')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              ダッシュボードに戻る
            </Button>
            <h1 className="text-xl font-bold text-gray-900">OEM商品売上入力</h1>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="h-8 px-2 py-1 text-sm rounded-md border border-input bg-background"
              disabled={loading}
            >
              {yearOptions.map(year => <option key={year} value={year}>{year}年</option>)}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-8 px-2 py-1 text-sm rounded-md border border-input bg-background"
              disabled={loading}
            >
              {monthOptions.map(month => <option key={month} value={month}>{month}月</option>)}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/wholesale/oem-customers')}
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              顧客管理
            </Button>
            <div className="text-sm font-semibold text-green-600">
              月合計: ¥{monthlyTotal.toLocaleString()}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><p className="text-gray-500">データを読み込んでいます...</p></div>
        ) : (
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Package className="w-5 h-5" /> 売上データ入力
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {/* 入力フォーム */}
              <div className="flex items-end gap-3 mb-6">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">商品名</label>
                  <select
                    value={formData.productId}
                    onChange={(e) => handleFormChange('productId', e.target.value)}
                    className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
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
                  <label className="block text-sm font-medium mb-1">発注者</label>
                  <select
                    value={formData.customerId}
                    onChange={(e) => handleFormChange('customerId', e.target.value)}
                    className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  >
                    <option value="">選択してください</option>
                    {oemCustomers.map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.customer_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-36">
                  <label className="block text-sm font-medium mb-1">日付</label>
                  <input
                    type="date"
                    value={formData.saleDate}
                    onChange={(e) => handleFormChange('saleDate', e.target.value)}
                    className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-sm font-medium mb-1">単価</label>
                  <input
                    type="number"
                    value={formData.unitPrice}
                    onChange={(e) => handleFormChange('unitPrice', e.target.value)}
                    className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                    placeholder="¥"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-sm font-medium mb-1">個数</label>
                  <input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => handleFormChange('quantity', e.target.value)}
                    className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background"
                    placeholder="0"
                  />
                </div>
                <div className="w-32 text-right">
                  <label className="block text-sm font-medium mb-1">合計金額</label>
                  <div className="h-9 px-3 py-2 text-sm font-semibold text-green-600">
                    ¥{calculateAmount().toLocaleString()}
                  </div>
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={isAdding}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {isAdding ? '登録中...' : '登録'}
                </Button>
              </div>

              {/* OEM売上一覧 */}
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr className="border-b">
                      <th className="p-3 text-left font-semibold">日付</th>
                      <th className="p-3 text-left font-semibold">商品名</th>
                      <th className="p-3 text-left font-semibold">発注者</th>
                      <th className="p-3 text-right font-semibold">単価</th>
                      <th className="p-3 text-right font-semibold">個数</th>
                      <th className="p-3 text-right font-semibold">金額</th>
                      <th className="p-3 text-center font-semibold">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oemSales.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-gray-500">
                          データがありません
                        </td>
                      </tr>
                    ) : (
                      oemSales.map(sale => (
                        <tr key={sale.id} className="border-b hover:bg-gray-50">
                          <td className="p-3">{sale.sale_date}</td>
                          <td className="p-3">{sale.oem_products?.product_name}</td>
                          <td className="p-3">{sale.oem_customers?.customer_name}</td>
                          <td className="p-3 text-right">¥{sale.unit_price.toLocaleString()}</td>
                          <td className="p-3 text-right">{sale.quantity}</td>
                          <td className="p-3 text-right font-semibold text-green-600">
                            ¥{sale.amount.toLocaleString()}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleDelete(sale.id)}
                              className="text-red-500 hover:text-red-700 p-1"
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
        )}
      </main>
    </div>
  );
}
