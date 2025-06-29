// /app/components/YahooCsvImportModal.tsx ver.2
// 楽天UIパターン完全統一版（3ステップ式・未マッチ修正UI完備・件数計算修正版）

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Upload, AlertCircle, ArrowRight, ArrowLeft, FileText, AlertTriangle } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  series: string;
  series_code: number;
  product_code: number;
}

interface YahooCsvImportModalProps {
  onImportComplete: () => void;
  selectedMonth: string;
  isOpen?: boolean;
  onClose?: () => void;
  products: Product[];
}

interface MatchedProduct {
  productTitle: string;
  quantity: number;
  score: number;
  productInfo: { id: string; name: string } | null;
  isLearned: boolean;
}

interface ParseResult {
  success: boolean;
  summary: {
    totalProducts: number;
    matchedProducts: number;
    unmatchedProducts: number;
    learnedMatches: number;
    blankTitleInfo: {
      count: number;
      totalQuantity: number;
    };
  };
  matchedProducts: MatchedProduct[];
  blankTitleProducts: any[];
}

export default function YahooCsvImportModal({ 
  onImportComplete, 
  selectedMonth, 
  isOpen: propIsOpen, 
  onClose: propOnClose,
  products 
}: YahooCsvImportModalProps) {
  const [isOpen, setIsOpen] = useState(propIsOpen || false);
  const [step, setStep] = useState(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [newMappings, setNewMappings] = useState<Array<{yahooTitle: string; productId: string; quantity: number}>>([]);
  const [currentUnmatchIndex, setCurrentUnmatchIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [saleMonth, setSaleMonth] = useState<string>(selectedMonth);

  // 未マッチ商品を正確に特定
  const getUnmatchedProducts = () => {
    if (!parseResult) return [];
    return parseResult.matchedProducts.filter(p => !p.productInfo);
  };

  // 修正済み未マッチ商品を除外
  const getRemainingUnmatchedProducts = () => {
    const unmatchedProducts = getUnmatchedProducts();
    return unmatchedProducts.filter(p => 
      !newMappings.some(m => m.yahooTitle === p.productTitle)
    );
  };

  // propsでisOpenが渡された場合は外部制御
  useEffect(() => {
    if (propIsOpen !== undefined) {
      setIsOpen(propIsOpen);
    }
  }, [propIsOpen]);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setCsvFile(null);
      setParseResult(null);
      setNewMappings([]);
      setCurrentUnmatchIndex(0);
      setError('');
    }
  }, [isOpen]);

  // ステップ3で未マッチ商品がなくなったら自動的にステップ2に戻る
  useEffect(() => {
    if (step === 3 && getRemainingUnmatchedProducts().length === 0) {
      setStep(2);
      setCurrentUnmatchIndex(0);
    }
  }, [step, newMappings, parseResult]);

  const handleClose = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      setIsOpen(false);
    }
    resetState();
  };

  const resetState = () => {
    setStep(1);
    setCsvFile(null);
    setParseResult(null);
    setNewMappings([]);
    setCurrentUnmatchIndex(0);
    setError('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setCsvFile(selectedFile);
      setParseResult(null);
      setNewMappings([]);
      setError('');
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
      // ファイルをUTF-8として読み込み（エンコーディング自動判定）
      const arrayBuffer = await csvFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      let csvData: string;
      
      // UTF-8で試行
      const decoder = new TextDecoder('utf-8');
      const utf8Text = decoder.decode(uint8Array);
      
      if (!utf8Text.includes('�') && !utf8Text.includes('\uFFFD')) {
        csvData = utf8Text;
      } else {
        // Shift-JISで試行
        try {
          const sjisDecoder = new TextDecoder('shift-jis');
          const sjisText = sjisDecoder.decode(uint8Array);
          
          if (!sjisText.includes('�') && !sjisText.includes('\uFFFD')) {
            csvData = sjisText;
          } else {
            // EUC-JPで試行
            const eucDecoder = new TextDecoder('euc-jp');
            csvData = eucDecoder.decode(uint8Array);
          }
        } catch (sjisError) {
          csvData = utf8Text;
        }
      }
      
      const response = await fetch('/api/import/yahoo-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Yahoo CSVの解析に失敗しました');
      }

      setParseResult(result);
      setStep(2);
    } catch (error) {
      console.error('Yahoo CSV解析エラー:', error);
      setError(error instanceof Error ? error.message : '不明なエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartUnmatchFix = () => {
    const remainingUnmatched = getRemainingUnmatchedProducts();
    if (remainingUnmatched.length > 0) {
      setStep(3);
      setCurrentUnmatchIndex(0);
    }
  };

  const handleProductSelect = (productId: string) => {
    if (!parseResult) return;
    
    const remainingUnmatched = getRemainingUnmatchedProducts();
    const currentUnmatch = remainingUnmatched[currentUnmatchIndex];
    
    if (productId !== 'skip') {
      const mapping = {
        yahooTitle: currentUnmatch.productTitle,
        productId: productId,
        quantity: currentUnmatch.quantity
      };
      setNewMappings(prev => [...prev, mapping]);
    }

    // 次の未マッチ商品があるかチェック
    if (currentUnmatchIndex < remainingUnmatched.length - 1) {
      setCurrentUnmatchIndex(currentUnmatchIndex + 1);
    } else {
      // 全ての修正が完了したらステップ2に戻る
      setStep(2);
      setCurrentUnmatchIndex(0);
    }
  };

  const handleConfirm = async () => {
    if (!parseResult) return;
    
    setIsLoading(true);
    setError('');

    try {
      // マッチング済み商品を準備
      const matchedProducts = parseResult.matchedProducts.filter(p => p.productInfo);
      
      // 新しいマッピングを追加
      const updatedMatchedProducts = [
        ...matchedProducts,
        ...newMappings.map(mapping => ({
          productTitle: mapping.yahooTitle,
          quantity: mapping.quantity,
          score: 100,
          productInfo: {
            id: mapping.productId,
            name: products.find(p => p.id === mapping.productId)?.name || ''
          },
          isLearned: false,
          rawLine: ''
        }))
      ];

      const response = await fetch('/api/import/yahoo-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchedProducts: updatedMatchedProducts,
          targetMonth: saleMonth
        }),
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Yahoo CSVの確定に失敗しました');
      }

      alert(`Yahoo CSVデータが正常に登録されました\n登録件数: ${result.totalCount || result.successCount}件`);
      handleClose();
      onImportComplete();
    } catch (error) {
      console.error('Yahoo CSV確定エラー:', error);
      setError(error instanceof Error ? error.message : '確定処理中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  // プロップが渡されていない場合は独立ボタンとして表示
  if (!propIsOpen && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-1 text-xs font-semibold text-white bg-purple-600 rounded hover:bg-purple-700"
      >
        Yahoo
      </button>
    );
  }

  // プロップでisOpenが管理されているが、falseの場合は何も表示しない
  if (propIsOpen !== undefined && !propIsOpen) {
    return null;
  }

  if (!isOpen) return null;

  const remainingUnmatchedProducts = getRemainingUnmatchedProducts();
  const currentUnmatch = remainingUnmatchedProducts[currentUnmatchIndex];
  const yahooCore = currentUnmatch?.productTitle?.substring(0, 40).trim();
  const progress = remainingUnmatchedProducts.length > 0 
    ? ((currentUnmatchIndex + 1) / remainingUnmatchedProducts.length) * 100 
    : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">Yahoo CSV インポート</h2>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6">
          {step === 1 && (
            <>
              <p className="text-gray-600 mb-4">
                Yahoo売上CSVをアップロードしてください。文字エンコーディング自動判定対応。
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                  <span className="text-red-600 text-sm">{error}</span>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Yahoo CSV ファイル:</label>
                <div className="flex items-center gap-4 p-4 border-2 border-dashed rounded-lg">
                  <label htmlFor="yahoo-csv-upload" className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded-md border border-gray-300 transition-colors">
                    ファイルを選択
                  </label>
                  <Input
                    id="yahoo-csv-upload"
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2 text-gray-600">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <span>{csvFile ? csvFile.name : '選択されていません'}</span>
                  </div>
                </div>
                
                <Button 
                  onClick={handleParse}
                  disabled={!csvFile || isLoading}
                  className="w-full mt-4 bg-purple-600 hover:bg-purple-700"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isLoading ? '解析中...' : '次へ（確認画面）'}
                </Button>
              </div>
            </>
          )}

          {step === 2 && parseResult && (
            <>
              {parseResult.summary.blankTitleInfo && parseResult.summary.blankTitleInfo.count > 0 && (
                <div className="mb-4 p-4 bg-orange-50 border-l-4 border-orange-400">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-orange-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-bold text-orange-700">
                        警告: 商品名が空欄の行が {parseResult.summary.blankTitleInfo.count} 件見つかりました
                      </p>
                      <p className="text-xs text-orange-600 mt-1">
                        合計 {parseResult.summary.blankTitleInfo.totalQuantity} 個分が処理から除外されます。CSVを修正し再実行してください。
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">売上月:</label>
                <input
                  type="month"
                  value={saleMonth}
                  onChange={(e) => setSaleMonth(e.target.value)}
                  className="border rounded-md p-2 w-full"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    📊 数量チェック
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-gray-600">CSV総商品数</div>
                    <div className="text-2xl font-bold text-purple-600">
                      {parseResult.summary.totalProducts}件
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600">総販売数量</div>
                    <div className="text-2xl font-bold text-purple-600">
                      {parseResult.matchedProducts.reduce((sum, p) => sum + p.quantity, 0)}個
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600">処理可能数量</div>
                    <div className="text-2xl font-bold text-green-600">
                      {parseResult.matchedProducts.filter(p => p.productInfo).reduce((sum, p) => sum + p.quantity, 0) + 
                       newMappings.reduce((sum, m) => sum + m.quantity, 0)}個
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
                      {parseResult.summary.matchedProducts + newMappings.length}件
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-yellow-50">
                  <CardHeader>
                    <CardTitle className="text-yellow-700">未マッチ</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">
                      {getRemainingUnmatchedProducts().length}件
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  戻る
                </Button>
                
                {getRemainingUnmatchedProducts().length > 0 ? (
                  <Button onClick={handleStartUnmatchFix} className="flex-1 bg-purple-600 hover:bg-purple-700">
                    <ArrowRight className="h-4 w-4 mr-2" />
                    未マッチ商品を修正
                  </Button>
                ) : (
                  <Button 
                    onClick={handleConfirm}
                    disabled={isLoading}
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                  >
                    {isLoading ? '処理中...' : 'インポート実行'}
                  </Button>
                )}
              </div>
            </>
          )}

          {step === 3 && remainingUnmatchedProducts.length === 0 && (
            <div className="text-center py-8">
              <div className="text-green-600 text-xl font-bold mb-4">
                ✅ 全ての商品修正が完了しました！
              </div>
              <Button 
                onClick={() => setStep(2)}
                className="bg-purple-600 hover:bg-purple-700"
              >
                確認画面に戻る
              </Button>
            </div>
          )}

          {step === 3 && currentUnmatch && remainingUnmatchedProducts.length > 0 && (
            <>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span>未マッチ商品修正</span>
                  <span>{currentUnmatchIndex + 1} / {remainingUnmatchedProducts.length}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>

              <Card className="border-purple-200 mb-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-purple-700 flex items-center gap-2">
                    🛍️ Yahoo商品
                    <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">{currentUnmatch.quantity}個</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-3 bg-purple-50 rounded-md">
                    <div className="font-medium text-purple-900">
                      {yahooCore}
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
                          className="w-full p-4 text-left border border-gray-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors bg-white shadow-sm"
                        >
                          <div className="font-medium text-purple-900 mb-1">
                            {product.name}
                          </div>
                          <div className="text-sm text-gray-600">
                            シリーズ: {product.series} | コード: {product.series_code}-{product.product_code}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        商品データが見つかりません
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-4 pt-4 border-t">
                    <button
                      onClick={() => handleProductSelect('skip')}
                      className="w-full p-4 text-left border-2 border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="font-medium text-gray-600 flex items-center gap-2 justify-center">
                        <X className="h-5 w-5" />
                        この商品をスキップ
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
