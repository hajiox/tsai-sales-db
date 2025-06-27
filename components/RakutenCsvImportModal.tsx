// /components/RakutenCsvImportModal.tsx ver.3 (Amazonと統一デザイン版)

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
    name: string;
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
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }

    console.log('=== 楽天CSV解析開始 ===');
    console.log('ファイル:', file.name, file.size, 'bytes');

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      console.log('APIリクエスト送信中...');
      const response = await fetch('/api/import/rakuten-parse', {
        method: 'POST',
        body: formData,
      });

      console.log('APIレスポンス受信:', response.status, response.statusText);

      const result = await response.json();

      console.log('=== 楽天API レスポンス ===');
      console.log('成功:', result.success);
      console.log('全データ:', result);
      console.log('マッチ済み:', result.matchedProducts?.length || 0);
      console.log('未マッチ:', result.unmatchedProducts?.length || 0);
      
      // デバッグ: 実際のデータ構造を確認
      if (result.data) {
        console.log('楽天商品データ数:', result.data.length);
        if (result.data.length > 0) {
          console.log('楽天商品例:', result.data[0]);
        }
      }
      
      if (result.matchedProducts?.length > 0) {
        console.log('マッチ済み商品例:', result.matchedProducts[0]);
      }
      if (result.unmatchedProducts?.length > 0) {
        console.log('未マッチ商品例:', result.unmatchedProducts[0]);
      }

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
      // 現在の日付から売上月を取得（YYYY-MM形式）
      const currentDate = new Date();
      const saleDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;

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

          <p className="text-sm text-gray-600 mb-4">
            楽天市場の商品別売上CSVをアップロードしてください。商品名のマッチング確認画面を経由して楽天列のみを更新します。
          </p>

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
                <label className="block text-sm font-medium text-gray-700 mb-2">楽天CSV ファイル:</label>
                <div className="flex">
                  <button
                    onClick={() => document.getElementById('rakuten-file-input')?.click()}
                    className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-l-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    ファイルを選択
                  </button>
                  <div className="flex-1 px-3 py-2 border-t border-b border-r border-gray-300 rounded-r-md bg-gray-50 text-gray-500">
                    {file ? file.name : '選択されていません'}
                  </div>
                </div>
                <input
                  id="rakuten-file-input"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <button 
                onClick={parseCSV} 
                disabled={loading || !file}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    処理中...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    次へ（確認画面）
                  </>
                )}
              </button>
            </div>
          )}

          {step === 'confirm' && parseResult && (
            <div className="space-y-6">
              {/* 🔥 合計数チェック機能 */}
              <div className="bg-blue-50 p-4 rounded border border-blue-200">
                <h3 className="font-semibold text-blue-800 mb-2">📊 数量チェック</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-medium">CSV総商品数</div>
                    <div className="text-lg font-bold text-blue-600">
                      {parseResult.matchedProducts.length + parseResult.unmatchedProducts.length}件
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">総販売数量</div>
                    <div className="text-lg font-bold text-blue-600">
                      {[...parseResult.matchedProducts, ...parseResult.unmatchedProducts]
                        .reduce((sum, item) => sum + item.quantity, 0)}個
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">処理可能数量</div>
                    <div className="text-lg font-bold text-green-600">
                      {[...parseResult.matchedProducts, 
                        ...parseResult.unmatchedProducts.filter(item => newMappings[item.rakutenTitle])]
                        .reduce((sum, item) => sum + item.quantity, 0)}個
                    </div>
                  </div>
                </div>
                
                {parseResult.unmatchedProducts.filter(item => !newMappings[item.rakutenTitle]).length > 0 && (
                  <div className="mt-2 p-2 bg-yellow-100 rounded text-yellow-800 text-sm">
                    ⚠️ 未割り当て商品があります。すべて割り当てると合計が一致します。
                  </div>
                )}
              </div>

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
                              {product.name} ({product.series_code}-{product.product_code})
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
                  キャンセル
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
