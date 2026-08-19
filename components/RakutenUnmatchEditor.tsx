// /components/RakutenUnmatchEditor.tsx ver.1 - 楽天専用未マッチ商品修正

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Check, X } from 'lucide-react';

interface UnmatchedProduct {
  rakutenTitle: string;
  quantity: number;
}

interface Product {
  id: string;
  name: string;
  series: string;
  series_code: number;
  product_code: number;
}

interface RakutenUnmatchEditorProps {
  unmatchedProducts: UnmatchedProduct[];
  onComplete: (mappings: Array<{rakutenTitle: string; productId: string; quantity: number}>) => void;
  onCancel: () => void;
}

export default function RakutenUnmatchEditor({ 
  unmatchedProducts, 
  onComplete, 
  onCancel 
}: RakutenUnmatchEditorProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [mappings, setMappings] = useState<Map<string, string>>(new Map());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/products');
      const data = await response.json();
      setProducts(data.products || []);
    } catch (error) {
      console.error('商品データ取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductSelect = (productId: string) => {
    const newMappings = new Map(mappings);
    const currentProduct = unmatchedProducts[currentIndex];
    
    if (productId === 'skip') {
      newMappings.delete(currentProduct.rakutenTitle);
    } else {
      newMappings.set(currentProduct.rakutenTitle, productId);
    }
    
    setMappings(newMappings);
    
    // 次の商品に進む
    if (currentIndex < unmatchedProducts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleComplete = () => {
    const finalMappings = Array.from(mappings.entries()).map(([rakutenTitle, productId]) => {
      const unmatchedProduct = unmatchedProducts.find(p => p.rakutenTitle === rakutenTitle);
      return {
        rakutenTitle,
        productId,
        quantity: unmatchedProduct?.quantity || 0
      };
    });
    
    onComplete(finalMappings);
  };

  const currentProduct = unmatchedProducts[currentIndex];
  const progress = ((currentIndex + 1) / unmatchedProducts.length) * 100;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p>商品データを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!currentProduct) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <Check className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-green-600">マッチング完了</h3>
          <p className="text-gray-600">
            {mappings.size}件の商品をマッチングしました
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <Button onClick={handleComplete} className="flex-1">
            確定してインポート実行
          </Button>
        </div>
      </div>
    );
  }

  // 楽天商品名の前半40文字を表示用に抽出
  const rakutenCore = currentProduct.rakutenTitle.substring(0, 40).trim();
  const rakutenRest = currentProduct.rakutenTitle.length > 40 
    ? currentProduct.rakutenTitle.substring(40) 
    : '';

  return (
    <div className="space-y-4">
      {/* プログレスバー */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>商品マッチング進捗</span>
          <span>{currentIndex + 1} / {unmatchedProducts.length}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      {/* 楽天商品情報 */}
      <Card className="border-orange-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-orange-700 flex items-center gap-2">
            🛍️ 楽天商品（マッチング対象）
            <Badge variant="outline">{currentProduct.quantity}個</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="p-3 bg-orange-50 rounded-md">
            <div className="font-medium text-orange-900">
              {rakutenCore}
            </div>
            {rakutenRest && (
              <div className="text-sm text-orange-600 mt-1">
                {rakutenRest}
              </div>
            )}
          </div>
          <div className="text-sm text-gray-600">
            ※ マッチングには前半40文字のみ使用されます
          </div>
        </CardContent>
      </Card>

      {/* 商品選択肢 */}
      <Card>
        <CardHeader>
          <CardTitle>🎯 マッチする商品を選択してください</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-64 overflow-y-auto">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => handleProductSelect(product.id)}
              className="w-full p-3 text-left border rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
              <div className="font-medium text-blue-900">
                {product.name}
              </div>
              <div className="text-sm text-gray-600">
                {product.series} (シリーズ: {product.series_code}, 商品: {product.product_code})
              </div>
            </button>
          ))}
          
          {/* スキップオプション */}
          <button
            onClick={() => handleProductSelect('skip')}
            className="w-full p-3 text-left border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <div className="font-medium text-gray-600 flex items-center gap-2">
              <X className="h-4 w-4" />
              この商品をスキップ（マッチングしない）
            </div>
            <div className="text-sm text-gray-500">
              商品マスターに該当商品がない場合に選択
            </div>
          </button>
        </CardContent>
      </Card>

      {/* ナビゲーションボタン */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">
          <ArrowLeft className="h-4 w-4 mr-2" />
          中断
        </Button>
        <Button 
          variant="outline" 
          onClick={() => handleProductSelect('skip')}
          className="flex-1"
        >
          <X className="h-4 w-4 mr-2" />
          スキップ
        </Button>
      </div>
    </div>
  );
}
