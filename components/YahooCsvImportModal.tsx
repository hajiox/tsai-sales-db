// /app/components/YahooCsvImportModal.tsx ver.1
// Yahoo CSVインポートモーダル（既存UIパターン準拠・簡潔版）

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Check, X, AlertCircle, FileText } from "lucide-react";

interface YahooCsvImportModalProps {
  onImportComplete: () => void;
  selectedMonth: string;
  isOpen?: boolean;
  onClose?: () => void;
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
}

export default function YahooCsvImportModal({ onImportComplete, selectedMonth, isOpen: propIsOpen, onClose: propOnClose }: YahooCsvImportModalProps) {
  const [isOpen, setIsOpen] = useState(propIsOpen || false);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // propsでisOpenが渡された場合は外部制御
  React.useEffect(() => {
    if (propIsOpen !== undefined) {
      setIsOpen(propIsOpen);
    }
  }, [propIsOpen]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setParseResult(null);
      setError(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const csvData = await file.text();
      
      const response = await fetch('/api/import/yahoo-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData }),
      });

      const result = await response.json();

      if (result.success) {
        setParseResult(result);
      } else {
        setError(result.error || 'CSV解析に失敗しました');
      }
    } catch (err) {
      setError('CSV解析中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!parseResult?.matchedProducts) {
      setError('解析結果がありません');
      return;
    }

    setIsConfirming(true);
    setError(null);

    try {
      const response = await fetch('/api/import/yahoo-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchedProducts: parseResult.matchedProducts,
          targetMonth: selectedMonth
        }),
      });

      const result = await response.json();

      if (result.success) {
        handleClose();
        onImportComplete();
      } else {
        setError(result.error || '確定処理に失敗しました');
      }
    } catch (err) {
      setError('確定処理中にエラーが発生しました');
    } finally {
      setIsConfirming(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setParseResult(null);
    setError(null);
    setIsLoading(false);
    setIsConfirming(false);
  };

  const handleClose = () => {
    if (propOnClose) {
      propOnClose();
    } else {
      setIsOpen(false);
    }
    resetState();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={handleClose}></div>
      
      <div className="relative bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] overflow-y-auto m-4 w-full">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-600" />
              Yahoo売上CSVインポート（{selectedMonth}）
            </h2>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Yahoo売上CSV選択</label>
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={isLoading || isConfirming}
              />
              <p className="text-sm text-gray-500 mt-1">
                Yahoo売上CSV形式（商品名：A列、数量：F列）に対応
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                <span className="text-red-600 text-sm">{error}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                onClick={handleAnalyze}
                disabled={!file || isLoading || isConfirming}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    解析中...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    CSV解析
                  </>
                )}
              </Button>
              
              {parseResult && (
                <Button 
                  onClick={handleConfirm}
                  disabled={isConfirming}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isConfirming ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      確定中...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      確定実行
                    </>
                  )}
                </Button>
              )}
            </div>

            {parseResult && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3">Yahoo CSV解析結果</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="bg-white p-3 rounded border">
                      <div className="text-gray-600">総商品数</div>
                      <div className="text-lg font-bold text-purple-600">
                        {parseResult.summary.totalProducts}件
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <div className="text-gray-600">マッチング成功</div>
                      <div className="text-lg font-bold text-green-600">
                        {parseResult.summary.matchedProducts}件
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <div className="text-gray-600">未マッチング</div>
                      <div className="text-lg font-bold text-orange-600">
                        {parseResult.summary.unmatchedProducts}件
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <div className="text-gray-600">学習活用</div>
                      <div className="text-lg font-bold text-blue-600">
                        {parseResult.summary.learnedMatches}件
                      </div>
                    </div>
                  </div>
                  
                  {parseResult.summary.blankTitleInfo.count > 0 && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <div className="text-sm text-yellow-800">
                        <AlertCircle className="h-4 w-4 inline mr-1" />
                        商品名空欄: {parseResult.summary.blankTitleInfo.count}件 
                        (数量合計: {parseResult.summary.blankTitleInfo.totalQuantity})
                      </div>
                    </div>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left p-2 border-b">Yahoo商品名</th>
                        <th className="text-left p-2 border-b">数量</th>
                        <th className="text-left p-2 border-b">マッチング商品</th>
                        <th className="text-left p-2 border-b">状態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.matchedProducts.slice(0, 10).map((product, index) => (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="p-2 max-w-xs truncate" title={product.productTitle}>
                            {product.productTitle}
                          </td>
                          <td className="p-2 text-right">{product.quantity}</td>
                          <td className="p-2 max-w-xs truncate" title={product.productInfo?.name || ''}>
                            {product.productInfo?.name || '未マッチ'}
                          </td>
                          <td className="p-2">
                            {product.productInfo ? (
                              <span className="flex items-center gap-1">
                                <Check className="h-3 w-3 text-green-600" />
                                {product.isLearned ? (
                                  <span className="text-blue-600 text-xs">学習</span>
                                ) : (
                                  <span className="text-green-600 text-xs">マッチ</span>
                                )}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <X className="h-3 w-3 text-red-600" />
                                <span className="text-red-600 text-xs">未マッチ</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parseResult.matchedProducts.length > 10 && (
                    <div className="p-2 text-center text-sm text-gray-500">
                      ... 他 {parseResult.matchedProducts.length - 10} 件
                    </div>
                  )}
                </div>

                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-blue-800 mb-2">確定実行について</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• マッチングした商品のみがデータベースに登録されます</li>
                    <li>• 未マッチング商品は学習データとして保存されます</li>
                    <li>• 対象月: {selectedMonth}</li>
                    <li>• 既存データがある場合は数量が加算されます</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
