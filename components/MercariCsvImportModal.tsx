// /components/MercariCsvImportModal.tsx ver.8 (UIを他ECと統一)
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Upload, AlertCircle, ArrowLeft, FileText, Edit2, Check, Save } from 'lucide-react';

interface Product {
  id: string;
  name: string;
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
  const [parseResult, setParseResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [saleMonth, setSaleMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

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
      setParseResult(null);
      setError('');
      setAllMappings([]);
      setSavingMapping(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (parseResult && step === 3) {
      const matched = parseResult.matchedProducts || [];
      const unmatched = parseResult.unmatchedProducts || [];
      const mappings = [
        ...matched.map((m: any) => ({
          mercariTitle: m.mercariTitle,
          productId: m.productInfo?.id || '',
          productName: m.productInfo?.name || '',
          quantity: m.quantity,
          isLearned: m.isLearned || false
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
    if (e.target.files?.[0]) {
      setCsvFile(e.target.files[0]);
      setParseResult(null);
      setError('');
    }
  };

  // 機能はメルカリのまま（2段階API呼び出し）
  const handleParse = async () => {
    if (!csvFile) {
      setError('CSVファイルを選択してください');
      return;
    }
    setIsLoading(true);
    setError('');

    try {
      const csvContent = await csvFile.text();
      
      const aggregateResponse = await fetch('/api/aggregate/mercari-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent }),
      });
      const aggregateResult = await aggregateResponse.json();
      if (!aggregateResult.success) throw new Error(aggregateResult.error || 'メルカリCSVの集計に失敗しました');

      const matchingResponse = await fetch('/api/import/mercari-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aggregatedProducts: aggregateResult.aggregatedProducts }),
      });
      const matchingResult = await matchingResponse.json();
      if (!matchingResult.success) throw new Error(matchingResult.error || 'メルカリマッチング処理に失敗しました');

      setParseResult(matchingResult);
      setStep(2);
    } catch (error) {
      setError(error instanceof Error ? error.message : '処理中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLearnMapping = async (index: number) => {
    const mapping = allMappings[index];
    if (!mapping.productId || mapping.isLearned) return;
    setSavingMapping(mapping.mercariTitle);
    
    try {
      const response = await fetch('/api/import/mercari-learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mercariTitle: mapping.mercariTitle, productId: mapping.productId }),
      });
      const result = await response.json();
      if (result.success) {
        setAllMappings(prev => prev.map((m, i) => i === index ? { ...m, isLearned: true } : m));
      } else {
        throw new Error(result.error || '学習に失敗しました');
      }
    } catch (error) {
      alert('学習に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'));
    } finally {
      setSavingMapping(null);
    }
  };

  const handleMappingChange = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    setAllMappings(prev => prev.map((m, i) => 
      i === index ? { ...m, productId, productName: product?.name || '', isLearned: false } : m
    ));
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    setError('');
    
    const mappingsToConfirm = step === 3 ? allMappings : parseResult.matchedProducts;
    const validMappings = mappingsToConfirm
        .filter((m: any) => m.productId || m.productInfo?.id)
        .map((m: any) => ({
            mercariTitle: m.mercariTitle,
            quantity: m.quantity,
            productId: m.productId || m.productInfo.id
        }));

    try {
      const response = await fetch('/api/import/mercari-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleDate: `${saleMonth}-01`, salesData: validMappings }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || '確定処理に失敗しました');
      alert(`メルカリの売上データが登録されました\n登録件数: ${result.importedCount}件`);
      onSuccess();
    } catch (error) {
      setError(error instanceof Error ? error.message : '確定処理中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const getStats = () => {
    if (step === 3 && allMappings.length > 0) {
      const matched = allMappings.filter(m => m.productId).length;
      return { matched, unmatched: allMappings.length - matched };
    } else if (parseResult) {
      return {
        matched: parseResult.matchedProducts?.length || 0,
        unmatched: parseResult.unmatchedProducts?.length || 0
      };
    }
    return { matched: 0, unmatched: 0 };
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
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
              <span className="text-red-600 text-sm">{error}</span>
            </div>
          )}

          {step === 1 && (
            <div className="mb-6">
              <p className="text-gray-600 mb-4">メルカリShopsの売上CSVをアップロードしてください。</p>
              <div className="flex items-center gap-4 p-4 border-2 border-dashed rounded-lg">
                <label htmlFor="mercari-csv-upload" className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded-md border border-gray-300 transition-colors">ファイルを選択</label>
                <Input id="mercari-csv-upload" type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                <div className="flex items-center gap-2 text-gray-600">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <span>{csvFile ? csvFile.name : '選択されていません'}</span>
                </div>
              </div>
              <Button onClick={handleParse} disabled={!csvFile || isLoading} className="w-full mt-4">
                <Upload className="h-4 w-4 mr-2" />{isLoading ? '解析中...' : '次へ（確認画面）'}
              </Button>
            </div>
          )}

          {step === 2 && parseResult && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">売上月:</label>
                <input type="month" value={saleMonth} onChange={(e) => setSaleMonth(e.target.value)} className="border rounded-md p-2 w-full" />
              </div>
              {/* ★★★【UI統一】「集計結果」カードを削除 ★★★ */}
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
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1"><ArrowLeft className="h-4 w-4 mr-2" />戻る</Button>
                <Button onClick={() => setStep(3)} className="flex-1"><Edit2 className="h-4 w-4 mr-2" />マッチング結果を修正</Button>
                <Button onClick={handleConfirm} disabled={isLoading || stats.matched === 0} className="flex-1">{isLoading ? '処理中...' : 'インポート実行'}</Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h3 className="text-lg font-bold mb-4">マッチング結果の修正</h3>
               {/* ★★★【UI統一】「現在の状況」カードを削除 ★★★ */}
              <Card>
                <CardHeader>
                  <CardTitle>📋 商品マッピング一覧</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {allMappings.map((mapping, index) => (
                      <div key={index} className={`p-4 border rounded-lg ${mapping.productId ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-gray-700">メルカリ商品名</label>
                            <div className="mt-1 p-2 bg-white rounded border text-sm break-words">{mapping.mercariTitle}</div>
                            <div className="text-xs text-gray-500 mt-1">数量: {mapping.quantity}個</div>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700">マスタ商品</label>
                            <select value={mapping.productId} onChange={(e) => handleMappingChange(index, e.target.value)} className="mt-1 w-full p-2 border rounded text-sm">
                              <option value="">-- 未選択 --</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            {mapping.productId && (
                              <div className="mt-2 flex items-center gap-2">
                                <Button size="sm" variant={mapping.isLearned ? "secondary" : "default"} disabled={mapping.isLearned || savingMapping === mapping.mercariTitle} onClick={() => handleLearnMapping(index)}>
                                  {savingMapping === mapping.mercariTitle ? '学習中...' : (mapping.isLearned ? <><Check className="h-3 w-3 mr-1" />学習済み</> : <><Save className="h-3 w-3 mr-1" />この組み合わせを学習</>)}
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
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1"><ArrowLeft className="h-4 w-4 mr-2" />確認画面に戻る</Button>
                <Button onClick={handleConfirm} disabled={isLoading || stats.matched === 0} className="flex-1">{isLoading ? '処理中...' : `インポート実行（${stats.matched}件）`}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
