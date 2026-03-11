// /components/wholesale/oem-area.tsx ver.6 検索機能追加
"use client"

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, TrendingUp, Search, X, Loader2 } from 'lucide-react';
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

interface SearchResult {
  id: string;
  sale_date: string;
  quantity: number;
  unit_price: number;
  amount: number;
  product_name: string;
  product_code: string;
  customer_name: string;
  customer_code: string;
}

interface OEMAreaProps {
  oemProducts: OEMProduct[];
  oemSales: OEMSale[];
  selectedYear?: string;
  selectedMonth?: string;
}

export default function OEMArea({ oemProducts, oemSales, selectedYear, selectedMonth }: OEMAreaProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchSummary, setSearchSummary] = useState<{ count: number; totalAmount: number; totalQuantity: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 商品ごとの売上集計
  const productSummary = oemProducts.map(product => {
    const sales = oemSales.filter(sale => sale.product_id === product.id);
    const totalQuantity = sales.reduce((sum, sale) => sum + sale.quantity, 0);
    const totalAmount = sales.reduce((sum, sale) => sum + sale.amount, 0);
    const unitPrices = [...new Set(sales.map(s => s.unit_price))];
    const displayPrice = unitPrices.length === 1 ? unitPrices[0] : (totalQuantity > 0 ? Math.round(totalAmount / totalQuantity) : product.price);

    return {
      product,
      totalQuantity,
      totalAmount,
      displayPrice
    };
  }).filter(item => item.totalAmount > 0)
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const handleOemSalesClick = () => {
    const params = new URLSearchParams();
    if (selectedYear) params.append('year', selectedYear);
    if (selectedMonth) params.append('month', selectedMonth);
    const queryString = params.toString();
    router.push(`/wholesale/oem-sales${queryString ? `?${queryString}` : ''}`);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setShowResults(true);
    try {
      const res = await fetch(`/api/wholesale/oem-sales/search?q=${encodeURIComponent(searchQuery)}&limit=30`);
      if (!res.ok) throw new Error('検索に失敗しました');
      const data = await res.json();
      setSearchResults(data.results || []);
      setSearchSummary(data.summary || null);
    } catch (error) {
      console.error('検索エラー:', error);
      setSearchResults([]);
      setSearchSummary(null);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchSummary(null);
    setShowResults(false);
    inputRef.current?.focus();
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
            {/* 検索窓 */}
            <div className="flex items-center gap-1">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  ref={inputRef}
                  placeholder="過去実績を検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-8 pr-7 h-8 w-[240px] text-sm bg-white border-green-300 focus:border-green-500"
                />
                {searchQuery && (
                  <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSearch}
                disabled={searching || !searchQuery.trim()}
                className="h-8 px-3 border-green-300 text-green-700 hover:bg-green-100"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

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
        {/* 検索結果表示 */}
        {showResults && (
          <div className="mb-4 bg-white rounded-lg border border-green-200 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-green-50 border-b border-green-200">
              <span className="text-sm font-medium text-green-800">
                🔍 検索結果: 「{searchQuery}」
                {searchSummary && (
                  <span className="ml-2 text-green-600">
                    {searchSummary.count}件 / 合計 ¥{searchSummary.totalAmount.toLocaleString()} / {searchSummary.totalQuantity}個
                  </span>
                )}
              </span>
              <button onClick={clearSearch} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {searching ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-green-500 mr-2" />
                <span className="text-sm text-gray-500">検索中...</span>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-6 text-center text-gray-500 text-sm">
                該当するデータがありません
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">日付</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">商品名</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">受託元</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">数量</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">単価</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 hover:bg-green-50/50">
                        <td className="px-3 py-1.5 text-xs text-gray-600 whitespace-nowrap">{r.sale_date}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-800">{r.product_name}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r.customer_name}</td>
                        <td className="px-3 py-1.5 text-right text-gray-700">{r.quantity}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">¥{r.unit_price.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-green-700">¥{r.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 当月OEM商品サマリー */}
        {productSummary.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">まだOEM売上データがありません</p>
            <p className="text-xs mt-2">「OEM売上入力」ボタンから売上データを登録してください</p>
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-2">
            {productSummary.map(({ product, totalQuantity, totalAmount, displayPrice }) => (
              <div key={product.id} className="bg-white rounded-lg p-2 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="font-medium text-gray-900 text-xs truncate" title={product.product_name}>
                  {product.product_name}
                </h3>
                <div className="mt-1 space-y-0.5">
                  <div className="flex justify-between items-center text-xs text-gray-600">
                    <span className="text-xs">単価:</span>
                    <span className="font-medium text-xs">¥{displayPrice.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-600">
                    <span className="text-xs">数量:</span>
                    <span className="font-medium text-xs">{totalQuantity}</span>
                  </div>
                  <div className="pt-1 mt-1 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">合計:</span>
                      <span className="text-xs font-bold text-green-700">
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
                ¥{oemSales.reduce((sum, sale) => sum + sale.amount, 0).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
