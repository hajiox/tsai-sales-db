// /components/wholesale/oem-summary.tsx ver.1
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, ArrowRight } from 'lucide-react';
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

interface OEMSummaryProps {
  oemProducts: OEMProduct[];
  oemSales: OEMSale[];
}

export default function OEMSummary({ oemProducts, oemSales }: OEMSummaryProps) {
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
  }).filter(item => item.totalAmount > 0) // 売上がある商品のみ表示
    .sort((a, b) => b.totalAmount - a.totalAmount); // 金額降順でソート

  return (
    <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
      <CardHeader className="py-3 px-4 border-b border-green-200">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-green-900 flex items-center gap-2">
            <Package className="w-4 h-4" />
            OEM商品実績サマリー
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {productSummary.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">まだOEM売上データがありません</p>
          </div>
        ) : (
          <div className="space-y-3">
            {productSummary.map(({ product, totalQuantity, totalAmount }) => (
              <div key={product.id} className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 text-sm">
                      {product.product_name}
                    </h3>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-600">
                      <span>単価: ¥{product.price.toLocaleString()}</span>
                      <span>数量: {totalQuantity}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-700">
                      ¥{totalAmount.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* OEM売上入力へのリンク */}
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push('/wholesale/oem-sales')}
            className="flex items-center gap-2 bg-white hover:bg-green-50 border-green-300 text-green-700"
          >
            OEM売上入力
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
