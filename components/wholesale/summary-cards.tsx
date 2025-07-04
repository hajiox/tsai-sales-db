// /components/wholesale/summary-cards.tsx ver.1
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, FileText, Users, DollarSign } from 'lucide-react';

interface SummaryCardsProps {
  products: any[];
  grandTotal: number;
}

export default function SummaryCards({ products, grandTotal }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-blue-900 flex items-center gap-1">
            <Package className="w-3 h-3" />
            卸商品
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-3">
          <div className="text-lg font-bold text-blue-900">{products.length} 件</div>
          <div className="text-xs text-blue-700">¥{grandTotal.toLocaleString()}</div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-green-900 flex items-center gap-1">
            <FileText className="w-3 h-3" />
            OEM商品
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-3">
          <div className="text-lg font-bold text-green-900">0 件</div>
          <div className="text-xs text-green-700">¥0</div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-purple-900 flex items-center gap-1">
            <Users className="w-3 h-3" />
            取引先
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-3">
          <div className="text-lg font-bold text-purple-900">0 社</div>
          <div className="text-xs text-purple-700">卸先・OEM発注者</div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm font-medium text-orange-900 flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            合計金額
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-3">
          <div className="text-lg font-bold text-orange-900">¥{grandTotal.toLocaleString()}</div>
          <div className="text-xs text-orange-700">当月売上</div>
        </CardContent>
      </Card>
    </div>
  );
}
