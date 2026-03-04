// /components/wholesale/sales-data-table.tsx ver.3 単価スナップショット方式
"use client"

import { KeyboardEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Product {
  id: string;
  product_name: string;
  price: number;
  profit_rate?: number;
  [key: string]: any;
}

interface SalesData {
  [productId: string]: { [date: string]: { quantity: number; unit_price: number; amount: number } | undefined; };
}

interface SalesDataTableProps {
  products: Product[];
  salesData: SalesData;
  daysInMonth: number;
  onQuantityChange: (productId: string, day: number, value: string) => void;
  onSave: (productId: string, day: number) => void;
  onInputKeyDown: (e: KeyboardEvent<HTMLInputElement>, productId: string, day: number) => void;
}

export default function SalesDataTable({
  products,
  salesData,
  daysInMonth,
  onQuantityChange,
  onSave,
  onInputKeyDown,
}: SalesDataTableProps) {
  const router = useRouter();

  const calculateTotals = (productId: string) => {
    const sales = salesData[productId] || {};
    let totalQuantity = 0;
    let totalAmount = 0;

    Object.values(sales).forEach(dayData => {
      if (dayData) {
        totalQuantity += dayData.quantity || 0;
        totalAmount += dayData.amount || 0;
      }
    });

    return { totalQuantity, totalAmount };
  };

  return (
    <Card>
      <CardHeader className="py-2 px-4 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> 日別売上実績
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/wholesale/products')}
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              卸商品管理
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/wholesale/oem-products')}
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              OEM商品管理
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="p-2 text-left font-semibold text-gray-700 min-w-[180px] border-r">商品情報</th>
              {Array.from({ length: daysInMonth }, (_, i) => (
                <th key={i + 1} className="p-1 text-center font-semibold text-gray-600 min-w-[40px] border-l">{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={daysInMonth + 1} className="text-center py-10 text-gray-500">商品データがありません。</td>
              </tr>
            ) : products.map((product, productIndex) => {
              const { totalQuantity, totalAmount } = calculateTotals(product.id);
              // Removed: const priceDiff = getPriceDifference(product.id);
              // The rest of the products.map content would go here, but was not provided in the edit.
              // Assuming the user intended to remove the priceDiff line and potentially other history-related logic.
              // As the provided snippet only shows the closing of the map and tbody,
              // I'm making the minimal change to remove the specified line and keep the structure.
              return (
                <tr key={product.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 border-r">
                    <div className="font-medium text-gray-800">{product.product_name}</div>
                    <div className="text-gray-500">単価: {product.price.toLocaleString()}円</div>
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const dateKey = `${day.toString().padStart(2, '0')}`;
                    const daySales = salesData[product.id]?.[dateKey];
                    const quantity = daySales?.quantity ?? '';

                    return (
                      <td key={day} className="p-0 border-l text-center">
                        <input
                          type="number"
                          value={quantity}
                          onChange={(e) => onQuantityChange(product.id, day, e.target.value)}
                          onBlur={() => onSave(product.id, day)}
                          onKeyDown={(e) => onInputKeyDown(e, product.id, day)}
                          className="w-full h-full p-1 text-center bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
                          aria-label={`${product.product_name} ${day}日の数量`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
