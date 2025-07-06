// /components/MercariCsvImportModal.tsx ver.4 (修正UI実装版 - 両パターン対応)
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Upload, AlertCircle, ArrowRight, ArrowLeft, FileText, AlertTriangle, Edit2, Check, Save } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  series: string;
  series_code: number;
  product_code: number;
}

interface MercariCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  products: Product[];
}

export default function MercariCsvImportModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  products
}: MercariCsvImportModalProps) {
  const [step, setStep] = useState(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [aggregatedData, setAggregatedData] = useState<any>(null);
  const [parseResult, setParseResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [saleMonth, setSaleMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // マッチング修正用の状態
  const [allMappings, setAllMappings] = useState<Array<{
    mercariTitle: string;
    productId: string;
    productName: string;
    quantity: number;
    isLearned?: boolean;
  }>>([]);
  const [savingMapping, setSavingMapping] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setCsvFile(null);
      setAggregatedData(null);
      setParseResult(null);
      setError('');
      setAllMappings([]);
      setSavingMapping(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (parseResult && step === 4) {
      const matched = parseResult.matchedProducts || [];
      const unmatched = parseResult.unmatchedProducts || [];
      
      const mappings = [
        // productInfoがある場合とない場合の両方に対応
        ...matched.map((m: any) => ({
          mercariTitle: m.mercariTitle,
          productId: m.productId || m.productInfo?.id || '',
          productName: m.productName || m.productInfo?.name || '',
          quantity: m.quantity,
          isLearned: false
        })),
        ...unmatched.map((u: any) => ({
          mercariTitle: u.mercariTitle,
          productId: '',
          productName: '',
          quantity: u.quantity,
          isLearned: false
        }))
      ];
      
      setAllMappings(mappings);
    }
  }, [parseResult, step]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setAggregatedData(null);
      setParseResult(null);
      setError('');
      setAllMappings([]);
    }
  };
  
  // Phase 1: CSV集計処理
  const handleAggregate = async () => {
    if (!csvFile) {
      setError('CSVファイルを選択してください');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const csvContent = await csvFile.text();
      
      console.log('Phase 1: CSV集計処理開始');
      const aggregateResponse = await fetch('/api/aggregate/mercari-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvContent }),
      });

      const aggregateResult = await aggregateResponse.json();

      if (!aggregateResult.success) {
        throw new Error(aggregateResult.error || 'メルカリCSVの集計に失敗しました');
      }

      console.log('集計結果:', aggregateResult);
      setAggregatedData(aggregateResult);
      setStep(2);
    } catch (error) {
      console.error('メルカリCSV集計エラー:', error);
      setError(error instanceof Error ? error.message : '集計処理中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  // Phase 2: マッチング処理
  const handleMatching = async () => {
    if (!aggregatedData) {
      setError('集計データがありません');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      console.log('Phase 2: マッチング処理開始');
      const matchingResponse = await fetch('/api/import/mercari-parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ aggregatedProducts: aggregatedData.aggregatedProducts }),
      });

      const matchingResult = await matchingResponse.json();

      if (!matchingResult.success) {
        throw new Error(matchingResult.error || 'メルカリマッチング処理に失敗しました');
      }

      console.log('マッチング結果:', matchingResult);
      setParseResult(matchingResult);
      setStep(3);
    } catch (error) {
      console.error('メルカリマッチング処理エラー:', error);
      setError(error instanceof Error ? error.message : 'マッチング処理中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 個別学習機能
  const handleLearnMapping = async (index: number) => {
    const mapping = allMappings[index];
    if (!mapping.productId || mapping.isLearned) return;

    setSavingMapping(mapping.mercariTitle);
    
    try {
      const response = await fetch('/api/import/mercari-learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mercariTitle: mapping.mercariTitle,
          productId: mapping.productId
        }),
      });

      const result = await response.json();
      if (result.success) {
        setAllMappings(prev => prev.map((m, i) => 
          i === index ? { ...m, isLearned: true } : m
        ));
      } else {
        throw new Error(result.error || '学習に失敗しました');
      }
    } catch (error) {
      console.error('学習エラー:', error);
      alert('学習に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'));
    } finally {
      setSavingMapping(null);
    }
  };

  // マッピング変更
  const handleMappingChange = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    setAllMappings(prev => prev.map((m, i) => 
      i === index ? { 
        ...m, 
        productId, 
        productName: product?.name || '',
        isLearned: false 
      } : m
    ));
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      let requestData;
      
      if (step === 4) {
        // Step 4からの場合は修正されたデータを使用
        const validMappings = allMappings.filter(m => m.productId);
        requestData = {
          saleDate: `${saleMonth}-01`,
          matchedProducts: validMappings.map(m => ({
            mercariTitle: m.mercariTitle,
            productInfo: {
              id: m.productId
            },
            quantity: m.quantity
          })),
          newMappings: [],
        };
      } else {
        // Step 3からの場合は元のデータを使用
        requestData = {
          saleDate: `${saleMonth}-01`,
          matchedProducts: parseResult.matchedProducts,
          newMappings: [],
        };
      }

      const response = await fetch('/api/import/mercari-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || '確定処理に失敗しました');
      }

      alert(`メルカリCSVデータが正常に登録されました\n登録件数: ${result.totalCount}件`);
      onSuccess();
    } catch (error) {
      console.error('メルカリCSV確定エラー:', error);
      setError(error instanceof Error ? error.message : '確定処理中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 統計情報の計算
  const getStats = () => {
    if (step === 4 && allMappings.length > 0) {
      const matched = allMappings.filter(m => m.productId).length;
      const unmatched = allMappings.filter(m => !m.productId).length;
      const totalQuantity = allMappings.filter(m => m.productId).reduce((sum, m) => sum + m.quantity, 0);
      return { matched, unmatched, totalQuantity };
    } else if (parseResult) {
      const matched = parseResult.matchedProducts?.length || 0;
      const unmatched = parseResult.unmatchedProducts?.length || 0;
      const totalQuantity = parseResult.summary?.processableQuantity || 0;
      return { matched, unmatched, totalQuantity };
    }
    return { matched: 0, unmatched: 0, totalQuantity: 0 };
  };

  const stats = getStats();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">メルカリCSV インポート</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-6">
          {/* Step 1: ファイル選択 */}
          {step === 1 && (
            <>
              <p className="text-gray-600 mb-4">メルカリShopsの売上CSVをアップロードしてください。</p>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                  <span className="text-red-600 text-sm">{error}</span>
                </div>
              )}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">メルカリCSV ファイル:</label>
                <div className="flex items-center gap-4 p-4 border-2 border-dashed rounded-lg">
                  <label htmlFor="mercari-csv-upload" className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded-md border border-gray-300 transition-colors">ファイルを選択</label>
                  <Input id="mercari-csv-upload" type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                  <div className="flex items-center gap-2 text-gray-600">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <span>{csvFile ? csvFile.name : '選択されていません'}</span>
                  </div>
                </div>
                <Button onClick={handleAggregate} disabled={!csvFile || isLoading} className="w-full mt-4">
                  <Upload className="h-4 w-4 mr-2" />
                  {isLoading ? '集計中...' : '次へ（集計処理）'}
                </Button>
              </div>
            </>
          )}

          {/* Step 2: 集計結果確認 */}
          {step === 2 && aggregatedData && (
            <>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2">📊 集計結果</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-gray-600">集計商品数</div>
                    <div className="text-2xl font-bold text-blue-600">{aggregatedData.summary?.totalProducts || 0}件</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600">総販売数量</div>
                    <div className="text-2xl font-bold text-blue-600">{aggregatedData.summary?.totalQuantity || 0}個</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600">処理した行数</div>
                    <div className="text-2xl font-bold text-green-600">{aggregatedData.summary?.processedRows || 0}行</div>
                  </div>
                </CardContent>
              </Card>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />戻る
                </Button>
                <Button onClick={handleMatching} disabled={isLoading} className="flex-1">
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {isLoading ? 'マッチング中...' : '次へ（マッチング処理）'}
                </Button>
              </div>
            </>
          )}

          {/* Step 3: マッチング結果確認 */}
          {step === 3 && parseResult && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">売上月:</label>
                <input type="month" value={saleMonth} onChange={(e) => setSaleMonth(e.target.value)} className="border rounded-md p-2 w-full" />
              </div>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2">🎯 マッチング結果</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-gray-600">総商品数</div>
                    <div className="text-2xl font-bold text-blue-600">{parseResult.summary?.totalProducts || 0}件</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600">総販売数量</div>
                    <div className="text-2xl font-bold text-blue-600">{parseResult.summary?.totalQuantity || 0}個</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600">登録可能数量</div>
                    <div className="text-2xl font-bold text-green-600">{stats.totalQuantity}個</div>
                  </div>
                </CardContent>
              </Card>
              
              <div className="grid grid-cols-2 gap-4 my-4">
                <Card className="bg-green-50">
                  <CardHeader><CardTitle className="text-green-700">マッチ済み</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold text-green-600">{stats.matched}件</div></CardContent>
                </Card>
                <Card className="bg-yellow-50">
                  <CardHeader><CardTitle className="text-yellow-700">未マッチ</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold text-yellow-600">{stats.unmatched}件</div></CardContent>
                </Card>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />戻る
                </Button>
                <Button onClick={() => setStep(4)} className="flex-1">
                  <Edit2 className="h-4 w-4 mr-2" />マッチング結果を修正
                </Button>
                <Button 
                  onClick={handleConfirm}
                  disabled={isLoading || stats.matched === 0}
                  className="flex-1"
                >
                  {isLoading ? '処理中...' : 'インポート実行'}
                </Button>
              </div>
            </>
          )}

          {/* Step 4: マッチング修正 */}
          {step === 4 && (
            <>
              <h3 className="text-lg font-bold mb-4">マッチング結果の修正</h3>
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>📊 現在の状況</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-sm text-gray-600">合計</div>
                      <div className="text-2xl font-bold">{allMappings.length}件</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">マッチ済み</div>
                      <div className="text-2xl font-bold text-green-600">{stats.matched}件</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">未マッチ</div>
                      <div className="text-2xl font-bold text-yellow-600">{stats.unmatched}件</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>📋 商品マッピング一覧</CardTitle>
                  <p className="text-sm text-gray-600">
                    メルカリ商品名とマスタ商品を紐付けてください。未マッチの商品は空欄のまま保存されません。
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {allMappings.map((mapping, index) => (
                      <div key={index} className={`p-4 border rounded-lg ${mapping.productId ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-gray-700">メルカリ商品名</label>
                            <div className="mt-1 p-2 bg-white rounded border text-sm break-words">
                              {mapping.mercariTitle}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">数量: {mapping.quantity}個</div>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700">マスタ商品</label>
                            <select
                              value={mapping.productId}
                              onChange={(e) => handleMappingChange(index, e.target.value)}
                              className="mt-1 w-full p-2 border rounded text-sm"
                            >
                              <option value="">-- 未選択（この商品はスキップ） --</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                            {mapping.productId && (
                              <div className="mt-2 flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant={mapping.isLearned ? "secondary" : "default"}
                                  disabled={mapping.isLearned || savingMapping === mapping.mercariTitle}
                                  onClick={() => handleLearnMapping(index)}
                                >
                                  {savingMapping === mapping.mercariTitle ? (
                                    <>学習中...</>
                                  ) : mapping.isLearned ? (
                                    <>
                                      <Check className="h-3 w-3 mr-1" />
                                      学習済み
                                    </>
                                  ) : (
                                    <>
                                      <Save className="h-3 w-3 mr-1" />
                                      この組み合わせを学習
                                    </>
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
              {error && (
                <div className="my-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                  <span className="text-red-600 text-sm">{error}</span>
                </div>
              )}
              
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />確認画面に戻る
                </Button>
                <Button 
                  onClick={handleConfirm} 
                  disabled={isLoading || stats.matched === 0} 
                  className="flex-1"
                >
                  {isLoading ? '処理中...' : `インポート実行（${stats.matched}件）`}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
