// /components/wholesale/summary-cards.tsx ver.2 OEM商品対応版
import { Card, CardContent } from "@/components/ui/card";
import { Package, Users, TrendingUp, FileText } from 'lucide-react';

interface Product {
  id: string;
  product_name: string;
  price: number;
}

interface SummaryCardsProps {
  products: Product[];
  oemProducts?: Product[];
  wholesaleTotal?: number;
  oemTotal?: number;
  grandTotal: number;
}

export default function SummaryCards({ 
  products, 
  oemProducts = [], 
  wholesaleTotal = 0,
  oemTotal = 0,
  grandTotal 
}: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">卸商品数</p>
              <p className="text-2xl font-bold">{products.length}</p>
              {wholesaleTotal > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  ¥{wholesaleTotal.toLocaleString()}
                </p>
              )}
            </div>
            <Package className="h-8 w-8 text-gray-400" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">OEM商品数</p>
              <p className="text-2xl font-bold">{oemProducts.length}</p>
              {oemTotal > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  ¥{oemTotal.toLocaleString()}
                </p>
              )}
            </div>
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">取引先数</p>
              <p className="text-2xl font-bold">1</p>
            </div>
            <Users className="h-8 w-8 text-gray-400" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">合計金額</p>
              <p className="text-2xl font-bold">¥{grandTotal.toLocaleString()}</p>
              <div className="text-xs text-gray-500 mt-1">
                <span>卸: ¥{wholesaleTotal.toLocaleString()}</span>
                <span className="ml-2">OEM: ¥{oemTotal.toLocaleString()}</span>
              </div>
            </div>
            <TrendingUp className="h-8 w-8 text-gray-400" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
