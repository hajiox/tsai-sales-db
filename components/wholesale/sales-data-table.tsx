// /components/wholesale/sales-data-table.tsx ver.2
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
  [key: string]: any;
}

interface SalesData {
  [productId: string]: { [date: string]: number | undefined; };
}

interface HistoricalPriceData {
  product_id: string;
  product_name: string;
  current_price: number;
  historical_price: number;
  total_quantity: number;
  current_amount: number;
  historical_amount: number;
  price_difference: number;
}

interface SalesDataTableProps {
  products: Product[];
  salesData: SalesData;
  isHistoricalMode: boolean;
  selectedHistoryDate: string | null;
  historicalPriceData: HistoricalPriceData[];
  daysInMonth: number;
  onQuantityChange: (productId: string, day: number, value: string) => void;
  onSave: (productId: string, day: number) => void;
  onInputKeyDown: (e: KeyboardEvent<HTMLInputElement>, productId: string, day: number) => void;
}

export default function SalesDataTable({
  products,
  salesData,
  isHistoricalMode,
  selectedHistoryDate,
  historicalPriceData,
  daysInMonth,
  onQuantityChange,
  onSave,
  onInputKeyDown,
}: SalesDataTableProps) {
  const router = useRouter();

  const calculateTotals = (productId: string) => {
    const sales = salesData[productId] || {};
    const totalQuantity = Object.values(sales).reduce((sum, qty) => sum + (qty || 0), 0);
    
    let price = 0;
    if (isHistoricalMode || selectedHistoryDate) {
      const historicalProduct = historicalPriceData.find(p => p.product_id === productId);
      price = historicalProduct?.historical_price || 0;
    } else {
      const product = products.find(p => p.id === productId);
      price = product?.price || 0;
    }
    
    const totalAmount = totalQuantity * price;
    return { totalQuantity, totalAmount };
  };

  const getPriceDifference = (productId: string) => {
    if (!isHistoricalMode && !selectedHistoryDate) return null;
    const historicalProduct = historicalPriceData.find(p => p.product_id === productId);
    if (!historicalProduct) return null;
    
    const diff = historicalProduct.price_difference;
    const percent = historicalProduct.current_price > 0 
      ? (diff / historicalProduct.current_price * 100).toFixed(1)
      : '0';
    
    return { diff, percent };
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
              const priceDiff = getPriceDifference(product.id);
              const rows = [];
              
              // 10商品ごとに日付ヘッダーを挿入
              if (productIndex > 0 && productIndex % 10 === 0) {
                rows.push(
                  <tr key={`date-header-${productIndex}`} className="bg-gray-100 border-t-2 border-gray-400">
                    <td className="p-1 text-center font-semibold text-gray-600 border-r">（日付）</td>
                    {Array.from({ length: daysInMonth }, (_, i) => (
                      <td key={i + 1} className="p-1 text-center font-semibold text-gray-600 text-xs border-l">{i + 1}</td>
                    ))}
                  </tr>
                );
              }
              
              // ストライプパターンの背景色を適用（偶数行に薄い水色）
              const rowBgClass = productIndex % 2 === 0 ? 'bg-sky-50' : 'bg-white';
              
              rows.push(
                <tr key={product.id} className={`border-b hover:bg-sky-100 ${rowBgClass}`}>
                  <td className="p-2 border-r">
                    <div className="w-[160px]">
                      <div className="font-medium text-gray-900 break-words">{product.product_name}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        <span>卸価格: ¥{product.price.toLocaleString()}</span>
                        {priceDiff && (
                          <span className={`ml-2 font-semibold ${priceDiff.diff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {priceDiff.diff > 0 ? '↑' : '↓'} {Math.abs(priceDiff.diff).toLocaleString()} ({priceDiff.percent}%)
                          </span>
                        )}
                        <span className="font-semibold text-blue-600 ml-2">合計: {totalQuantity}</span>
                      </div>
                      <div className="text-xs text-gray-600 font-semibold text-green-600">
                        <span>金額: ¥{totalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const value = salesData[product.id]?.[day];
                    return (
                      <td key={day} className="text-center p-0 border-l">
                        <input
                          type="text"
                          pattern="\d*"
                          value={value ?? ''}
                          onChange={(e) => onQuantityChange(product.id, day, e.target.value)}
                          onBlur={() => onSave(product.id, day)}
                          onKeyDown={(e) => onInputKeyDown(e, product.id, day)}
                          className="w-full h-full text-center p-1 bg-transparent border-0 focus:bg-blue-100 focus:ring-1 focus:ring-blue-400 focus:outline-none"
                        />
                      </td>
                    );
                  })}
                </tr>
              );
              
              return rows;
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
