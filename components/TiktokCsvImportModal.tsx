// /components/TiktokCsvImportModal.tsx ver.3 (インポートボタン修正版)
'use client';

import { useState, useEffect, useMemo } from 'react';
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

interface TiktokCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  products: Product[];
}

export default function TiktokCsvImportModal({
  isOpen,
  onClose,
  onImportComplete,
  products
}: TiktokCsvImportModalProps) {
  const [step, setStep] = useState(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [saleMonth, setSaleMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // マッチング修正用の状態
  const [allMappings, setAllMappings] = useState<Array<{
    tiktokTitle: string;
    productId: string;
    productName: string;
    quantity: number;
    isLearned?: boolean;
  }>>([]);
  const [savingMapping, setSavingMapping] = useState<string | null>(null);

  // 統計情報を計算
  const stats = useMemo(() => {
    const matched = allMappings.filter(m => m.productId).length;
    const unmatched = allMappings.length - matched;
    const totalQuantity = allMappings.filter(m => m.productId).reduce((sum, m) => sum + m.quantity, 0);

    return {
      matched,
      unmatched,
      totalQuantity
    };
  }, [allMappings]);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setCsvFile(null);
      setParseResult(null);
      setError('');
      setAllMappings([]);
      setSavingMapping(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (parseResult && step >= 2) {
      const learned = parseResult.results?.learned || [];
      const unlearned = parseResult.results?.unlearned || [];

      const mappings = [
        ...unlearned.map((item: any) => ({
          tiktokTitle: item.title,
          productId: '',
          productName: '',
          quantity: item.count,
          isLearned: false
        })),
        ...learned.map((item: any) => ({
          tiktokTitle: item.title,
          productId: item.productId || '',
          productName: products.find(p => p.id === item.productId)?.name || '',
          quantity: item.count,
          isLearned: false
        })),
      ];

      setAllMappings(mappings);
    }
  }, [parseResult, step, products]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setParseResult(null);
      setError('');
      setAllMappings([]);
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
      const text = await csvFile.text();

      const response = await fetch('/api/import/tiktok-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText: text }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'TikTok CSVの解析に失敗しました');
      }

      setParseResult(result);
      setStep(2);
    } catch (error) {
      console.error('TikTok CSV解析エラー:', error);
      setError(error instanceof Error ? error.message : '不明なエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 個別学習機能
  const handleLearnMapping = async (index: number) => {
    const mapping = allMappings[index];
    if (!mapping.productId || mapping.isLearned) return;

    setSavingMapping(mapping.tiktokTitle);

    try {
      const response = await fetch('/api/import/tiktok-learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: mapping.tiktokTitle,
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
      const validMappings = allMappings.filter(m => m.productId);

      if (validMappings.length === 0) {
        throw new Error('インポートする商品が1件もありません');
      }

      const items = validMappings.map(item => ({
        title: item.tiktokTitle,
        count: item.quantity,
        saleDate: saleMonth,
        productId: item.productId
      }));

      const response = await fetch('/api/import/tiktok-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'インポートに失敗しました');
      }

      onImportComplete();
      onClose();
    } catch (error) {
      console.error('確定エラー:', error);
      setError(error instanceof Error ? error.message : '不明なエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">TikTokショップ CSV インポート</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X /></button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${s <= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {s}
                </div>
                {s < 3 && <div className={`w-24 h-1 mx-2 ${s < step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                  <span className="text-red-600 text-sm">{error}</span>
                </div>
              )}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">TikTok CSV ファイル:</label>
                <div className="flex items-center gap-4 p-4 border-2 border-dashed rounded-lg">
                  <label htmlFor="tiktok-csv-upload" className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded-md border border-gray-300 transition-colors">ファイルを選択</label>
                  <Input id="tiktok-csv-upload" type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                  <div className="flex items-center gap-2 text-gray-600">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <span>{csvFile ? csvFile.name : '選択されていません'}</span>
                  </div>
                </div>
                <Button onClick={handleParse} disabled={!csvFile || isLoading} className="w-full mt-4">
                  <Upload className="h-4 w-4 mr-2" />
                  {isLoading ? '解析中...' : '次へ（確認画面）'}
                </Button>
              </div>
            </>
          )}

          {step === 2 && parseResult && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">売上月:</label>
                <input type="month" value={saleMonth} onChange={(e) => setSaleMonth(e.target.value)} className="border rounded-md p-2 w-full" />
              </div>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2">📊 数量チェック</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-gray-600">CSV総商品数</div>
                    <div className="text-2xl font-bold text-green-600">{parseResult.summary?.total || 0}件</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600">登録可能数量</div>
                    <div className="text-2xl font-bold text-green-600">{stats.totalQuantity}個</div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4 my-4">
                <Card className="bg-green-50">
                  <CardHeader><CardTitle className="text-green-700">学習済み</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold text-green-600">{parseResult.summary?.learned || 0}件</div></CardContent>
                </Card>
                <Card className="bg-yellow-50">
                  <CardHeader><CardTitle className="text-yellow-700">未学習</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold text-yellow-600">{parseResult.summary?.unlearned || 0}件</div></CardContent>
                </Card>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />戻る
                </Button>
                <Button onClick={() => setStep(3)} className="flex-1" disabled={stats.unmatched === 0}>
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

          {step === 3 && (
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
                    TikTok商品名とマスタ商品を紐付けてください。未マッチの商品は空欄のまま保存されません。
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {allMappings.map((mapping, index) => (
                      <div key={index} className={`p-4 border rounded-lg ${mapping.productId ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-gray-700">TikTok商品名</label>
                            <div className="mt-1 p-2 bg-white rounded border text-sm break-words">
                              {mapping.tiktokTitle}
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
                                  disabled={mapping.isLearned || savingMapping === mapping.tiktokTitle}
                                  onClick={() => handleLearnMapping(index)}
                                >
                                  {savingMapping === mapping.tiktokTitle ? (
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
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
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
