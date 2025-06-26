// /components/RakutenCsvImportModal.tsx ver.2 (既存UIコンポーネント対応版)

'use client';

import React, { useState } from 'react';
import { Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface RakutenProduct {
  rakutenTitle: string;
  productId?: string;
  productInfo?: any;
  quantity: number;
  originalRow: number;
}

interface RakutenCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  products: Array<{
    id: string;
    series: string;
    product_number: number;
    series_code: number;
    product_code: number;
  }>;
}

export default function RakutenCsvImportModal({
  isOpen,
  onClose,
  onSuccess,
  products
}: RakutenCsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [saleDate, setSaleDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'confirm'>('upload');
  const [parseResult, setParseResult] = useState<{
    matchedProducts: RakutenProduct[];
    unmatchedProducts: RakutenProduct[];
  } | null>(null);
  const [newMappings, setNewMappings] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
    }
  };

  const parseCSV = async () => {
    if (!file || !saleDate) {
      setError('ファイルと売上日を入力してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/rakuten-parse', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      setParseResult({
        matchedProducts: result.matchedProducts || [],
        unmatchedProducts: result.unmatchedProducts || []
      });
      setStep('confirm');

    } catch (error) {
      setError(error instanceof Error ? error.message : 'CSV解析に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleMappingChange = (rakutenTitle: string, productId: string) => {
    setNewMappings(prev => ({
      ...prev,
      [rakutenTitle]: productId
    }));
  };

  const confirmImport = async () => {
    if (!parseResult) return;

    setLoading(true);
    setError('');

    try {
      const newMappingsArray = parseResult.unmatchedProducts
        .filter(item => newMappings[item.rakutenTitle])
        .map(item => ({
          rakutenTitle: item.rakutenTitle,
          productId: newMappings[item.rakutenTitle],
          quantity: item.quantity
        }));

      const response = await fetch('/api/import/rakuten-confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          saleDate,
          matchedProducts: parseResult.matchedProducts,
          newMappings: newMappingsArray
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      setSuccess(`売上データ ${result.insertedSales}件を登録し、${result.learnedMappings}件のマッピングを学習しました`);
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 2000);

    } catch (error) {
      setError(error instanceof Error ? error.message : 'インポートに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setSaleDate('');
    setStep('upload');
    setParseResult(null);
    setNewMappings({});
    setError('');
    setSuccess('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl max-h-[80vh] overflow-y-auto w-full mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">楽天CSV インポート</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                <span className="text-red-800">{error}</span>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
              <div className="flex items-center">
                <CheckCircle2 className="h-4 w-4 text-green-600 mr-2" />
                <span className="text-green-800">{success}</span>
              </div>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">売上日</label>
                <input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">楽天CSV ファイル</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-sm text-gray-500 mt-1">
                  楽天市場の商品別売上CSVをアップロードしてください（8行目から商品データを読み取ります）
                </p>
              </div>

              <button 
                onClick={parseCSV} 
                disabled={loading || !file || !saleDate}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    解析中...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    CSV解析
                  </>
                )}
              </button>
            </div>
          )}

          {step === 'confirm' && parseResult && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-green-50 p-3 rounded border border-green-200">
                  <div className="font-semibold text-green-800">マッチ済み</div>
                  <div className="text-green-600">{parseResult.matchedProducts.length}件</div>
                </div>
                <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                  <div className="font-semibold text-yellow-800">未マッチ</div>
                  <div className="text-yellow-600">{parseResult.unmatchedProducts.length}件</div>
                </div>
              </div>

              {parseResult.unmatchedProducts.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">未マッチ商品の割り当て</h3>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {parseResult.unmatchedProducts.map((item, index) => (
                      <div key={index} className="border p-3 rounded">
                        <div className="font-medium text-sm mb-2">
                          {item.rakutenTitle.length > 50 
                            ? `${item.rakutenTitle.substring(0, 50)}...` 
                            : item.rakutenTitle}
                        </div>
                        <div className="text-sm text-gray-600 mb-2">数量: {item.quantity}</div>
                        <select
                          value={newMappings[item.rakutenTitle] || ''}
                          onChange={(e) => handleMappingChange(item.rakutenTitle, e.target.value)}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">商品を選択...</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.series} - {product.product_number} ({product.series_code}-{product.product_code})
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button 
                  onClick={() => setStep('upload')}
                  disabled={loading}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:bg-gray-200"
                >
                  戻る
                </button>
                <button 
                  onClick={confirmImport}
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      インポート中...
                    </>
                  ) : (
                    'インポート実行'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
