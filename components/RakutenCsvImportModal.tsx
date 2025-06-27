// /components/RakutenCsvImportModal.tsx ver.5 - 未マッチ修正機能付き

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Upload, AlertCircle, ArrowRight, ArrowLeft, Check } from 'lucide-react';

interface RakutenCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  products?: Product[]; // 商品データをpropsから受け取る
}

interface Product {
  id: string;
  name: string;
  series: string;
  series_code: number;
  product_code: number;
}

export default function RakutenCsvImportModal({ 
  isOpen, 
  onClose, 
  onSuccess 
}: RakutenCsvImportModalProps) {
  const [step, setStep] = useState(1); // 1: ファイル選択, 2: 確認, 3: 未マッチ修正
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [newMappings, setNewMappings] = useState<Array<{rakutenTitle: string; productId: string; quantity: number}>>([]);
  const [currentUnmatchIndex, setCurrentUnmatchIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // モーダルが閉じられた時のクリーンアップ
    if (!isOpen) {
      setStep(1);
      setCsvFile(null);
      setParseResult(null);
      setNewMappings([]);
      setCurrentUnmatchIndex(0);
      setError('');
    } else {
      // デバッグ: 商品データの確認
      console.log('楽天モーダル開いた時の商品データ:', products);
      console.log('商品データ件数:', products?.length || 0);
    }
  }, [isOpen, products]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setParseResult(null);
      setNewMappings([]);
      setError('');
      // stepは変更しない（ボタンクリック時のみ）
    }
  };

  const handleParse = async () => {
    if (!csvFile) {
      setError('CSVファイルを選択してください');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const csvContent = await csvFile.text();
      
      const response = await fetch('/api/import/rakuten-parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvContent }),
      });

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (jsonError) {
        throw new Error(`レスポンスのJSONパースに失敗: ${responseText.substring(0, 100)}...`);
      }

      if (!result.success) {
        throw new Error(result.error || '楽天CSVの解析に失敗しました');
      }

      setParseResult(result);
      setStep(2); // 確認画面に進む
    } catch (error) {
      console.error('楽天CSV解析エラー:', error);
      setError(error instanceof Error ? error.message : '不明なエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartUnmatchFix = () => {
    setStep(3);
    setCurrentUnmatchIndex(0);
    setNewMappings([]);
  };

  const handleProductSelect = (productId: string) => {
    const currentUnmatch = parseResult.unmatchedProducts[currentUnmatchIndex];
    
    if (productId !== 'skip') {
      const mapping = {
        rakutenTitle: currentUnmatch.rakutenTitle,
        productId: productId,
        quantity: currentUnmatch.quantity
      };
      setNewMappings(prev => [...prev, mapping]);
    }

    // 次の未マッチ商品に進む
    if (currentUnmatchIndex < parseResult.unmatchedProducts.length - 1) {
      setCurrentUnmatchIndex(currentUnmatchIndex + 1);
    } else {
      // 全て完了
      setStep(2);
    }
  };

  const handleConfirm = async () => {
    if (!parseResult) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/import/rakuten-confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          saleDate: '2025-03-01',
          matchedProducts: parseResult.matchedProducts || [],
          newMappings: newMappings
        }),
      });

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (jsonError) {
        throw new Error(`確定APIレスポンスのJSONパースに失敗: ${responseText.substring(0, 100)}...`);
      }

      if (!result.success) {
        throw new Error(result.error || '楽天CSVの確定に失敗しました');
      }

      alert(`楽天CSVデータが正常に登録されました\n登録件数: ${result.insertedSales}件`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('楽天CSV確定エラー:', error);
      setError(error instanceof Error ? error.message : '確定処理中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const currentUnmatch = parseResult?.unmatchedProducts?.[currentUnmatchIndex];
  const rakutenCore = currentUnmatch?.rakutenTitle?.substring(0, 40).trim();
  const progress = parseResult?.unmatchedProducts?.length > 0 
    ? ((currentUnmatchIndex + 1) / parseResult.unmatchedProducts.length) * 100 
    : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">楽天CSV インポート</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6">
          {/* ステップ1: ファイル選択 */}
          {step === 1 && (
            <>
              <p className="text-gray-600 mb-4">
                楽天市場の商品別売上CSVをアップロードしてください。
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                  <span className="text-red-600 text-sm">{error}</span>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">楽天CSV ファイル:</label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="mb-2"
                />
                <Button 
                  onClick={handleParse}
                  disabled={!csvFile || isLoading}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isLoading ? '解析中...' : '次へ（確認画面）'}
                </Button>
              </div>
            </>
          )}

          {/* ステップ2: 確認画面 */}
          {step === 2 && parseResult && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    📊 数量チェック
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-gray-600">CSV総商品数</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {parseResult.totalProducts}件
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600">総販売数量</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {parseResult.totalQuantity}個
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600">処理可能数量</div>
                    <div className="text-2xl font-bold text-green-600">
                      {parseResult.processableQuantity + newMappings.reduce((sum, m) => sum + m.quantity, 0)}個
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4 my-4">
                <Card className="bg-green-50">
                  <CardHeader>
                    <CardTitle className="text-green-700">マッチ済み</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {(parseResult.matchedProducts?.length || 0) + newMappings.length}件
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-yellow-50">
                  <CardHeader>
                    <CardTitle className="text-yellow-700">未マッチ</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">
                      {(parseResult.unmatchedProducts?.length || 0) - newMappings.length}件
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  戻る
                </Button>
                
                {(parseResult.unmatchedProducts?.length || 0) > newMappings.length ? (
                  <Button onClick={handleStartUnmatchFix} className="flex-1">
                    <ArrowRight className="h-4 w-4 mr-2" />
                    未マッチ商品を修正
                  </Button>
                ) : (
                  <Button 
                    onClick={handleConfirm}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    {isLoading ? '処理中...' : 'インポート実行'}
                  </Button>
                )}
              </div>
            </>
          )}

          {/* ステップ3: 未マッチ修正 */}
          {step === 3 && currentUnmatch && (
            <>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span>未マッチ商品修正</span>
                  <span>{currentUnmatchIndex + 1} / {parseResult.unmatchedProducts.length}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>

              <Card className="border-orange-200 mb-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-orange-700 flex items-center gap-2">
                    🛍️ 楽天商品
                    <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">{currentUnmatch.quantity}個</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-3 bg-orange-50 rounded-md">
                    <div className="font-medium text-orange-900">
                      {rakutenCore}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>🎯 マッチする商品を選択してください</CardTitle>
                  <p className="text-sm text-gray-600">
                    {products?.length || 0}件の商品から選択するか、該当なしの場合はスキップしてください
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-72 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                    {products && products.length > 0 ? (
                      products.map((product) => (
                        <button
                          key={product.id}
                          onClick={() => handleProductSelect(product.id)}
                          className="w-full p-4 text-left border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors bg-white shadow-sm"
                        >
                          <div className="font-medium text-blue-900 mb-1">
                            {product.name}
                          </div>
                          <div className="text-sm text-gray-600">
                            シリーズ: {product.series} | コード: {product.series_code}-{product.product_code}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <div className="text-red-600 mb-2">
                          ⚠️ 商品データが見つかりません
                        </div>
                        <div className="text-sm">
                          商品マスターにデータが登録されていない可能性があります
                        </div>
                        <div className="text-xs text-gray-400 mt-2">
                          渡された商品データ: {products?.length || 0}件
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* スキップボタンを分離 */}
                  <div className="mt-4 pt-4 border-t">
                    <button
                      onClick={() => handleProductSelect('skip')}
                      className="w-full p-4 text-left border-2 border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="font-medium text-gray-600 flex items-center gap-2 justify-center">
                        <X className="h-5 w-5" />
                        この商品をスキップ（商品マスターに該当商品がない場合）
                      </div>
                      <div className="text-sm text-gray-500 text-center mt-1">
                        スキップした商品は売上データに登録されません
                      </div>
                    </button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  確認画面に戻る
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
