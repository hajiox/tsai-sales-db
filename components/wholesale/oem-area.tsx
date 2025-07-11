// /components/wholesale/oem-area.tsx ver.2 年月引き継ぎ対応版
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Settings, Users, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface OEMProduct {
  id: string;
  product_name: string;
  price: number;
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

interface OEMAreaProps {
  oemProducts: OEMProduct[];
  oemSales: OEMSale[];
  selectedYear?: string;
  selectedMonth?: string;
}

export default function OEMArea({ oemProducts, oemSales, selectedYear, selectedMonth }: OEMAreaProps) {
  const router = useRouter();

  // 商品ごとの売上集計
  const productSummary = oemProducts.map(product => {
    const sales = oemSales.filter(sale => sale.product_id === product.id);
    const totalQuantity = sales.reduce((sum, sale) => sum + sale.quantity, 0);
    const totalAmount = sales.reduce((sum, sale) => sum + sale.amount, 0);
    
    return {
      product,
      totalQuantity,
      totalAmount
    };
  }).filter(item => item.totalAmount > 0)
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const handleOemSalesClick = () => {
    // 年月パラメータを付けて遷移
    const params = new URLSearchParams();
    if (selectedYear) params.append('year', selectedYear);
    if (selectedMonth) params.append('month', selectedMonth);
    const queryString = params.toString();
    router.push(`/wholesale/oem-sales${queryString ? `?${queryString}` : ''}`);
  };

  return (
    <Card className="w-full bg-gradient-to-br from-green-50 to-green-100 border-green-200">
      <CardHeader className="py-3 px-4 border-b border-green-200">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-green-900 flex items-center gap-2">
            <Package className="w-4 h-4" />
            OEMエリア
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/wholesale/oem-products')}
              className="flex items-center gap-2 bg-white hover:bg-green-50 border-green-300 text-green-700"
            >
              <Settings className="w-4 h-4" />
              OEM商品管理
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/wholesale/oem-customers')}
              className="flex items-center gap-2 bg-white hover:bg-green-50 border-green-300 text-green-700"
            >
              <Users className="w-4 h-4" />
              OEM顧客管理
            </Button>
            <Button
              size="sm"
              onClick={handleOemSalesClick}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              <TrendingUp className="w-4 h-4" />
              OEM売上入力
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {productSummary.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">まだOEM売上データがありません</p>
            <p className="text-xs mt-2">「OEM売上入力」ボタンから売上データを登録してください</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {productSummary.map(({ product, totalQuantity, totalAmount }) => (
              <div key={product.id} className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="font-medium text-gray-900 text-sm truncate" title={product.product_name}>
                  {product.product_name}
                </h3>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between items-center text-xs text-gray-600">
                    <span>単価:</span>
                    <span className="font-medium">¥{product.price.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-600">
                    <span>数量:</span>
                    <span className="font-medium">{totalQuantity}</span>
                  </div>
                  <div className="pt-2 mt-2 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">合計:</span>
                      <span className="text-base font-bold text-green-700">
                        ¥{totalAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* 合計表示 */}
        {productSummary.length > 0 && (
          <div className="mt-4 pt-4 border-t border-green-200">
            <div className="flex justify-end items-center gap-4">
              <span className="text-sm text-gray-600">OEM売上合計:</span>
              <span className="text-xl font-bold text-green-800">
                ¥{productSummary.reduce((sum, item) => sum + item.totalAmount, 0).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
