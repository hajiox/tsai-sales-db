// /components/MercariCsvImportModal.tsx ver.7 (単一API呼び出し版)
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
    if (parseResult) {
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
  }, [parseResult]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setCsvFile(e.target.files[0]);
      setError('');
    }
  };
  
  // ★★★【最重要修正】★★★
  // API呼び出しを1回に統合
  const handleParse = async () => {
    if (!csvFile) {
      setError('CSVファイルを選択してください');
      return;
    }
    setIsLoading(true);
    setError('');

    try {
      const csvContent = await csvFile.text();
      
      const response = await fetch('/api/import/mercari-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'メルカリCSVの処理に失敗しました');
      }

      setParseResult(result);
      setStep(2);
    } catch (error) {
      console.error('メルカリCSV処理エラー:', error);
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
      if (!result.success) throw new Error(result.error || '学習に失敗しました');
      setAllMappings(prev => prev.map((m, i) => i === index ? { ...m, isLearned: true } : m));
    } catch (error) {
      alert('学習エラー: ' + (error instanceof Error ? error.message : '不明なエラー'));
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
    const source = step === 3 ? allMappings : (parseResult ? [...parseResult.matchedProducts, ...parseResult.unmatchedProducts] : []);
    const matched = source.filter(m => m.productId || m.productInfo?.id).length;
    const unmatched = source.length - matched;
    return { matched, unmatched, total: source.length };
  };

  const stats = getStats();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>メルカリCSV インポート</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5"/></Button>
        </CardHeader>
        <div className="p-6 overflow-y-auto">
          {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md border border-red-200">{error}</div>}
          
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-gray-600">メルカリShopsの売上CSVをアップロードしてください。</p>
              <Input id="mercari-csv-upload" type="file" accept=".csv" onChange={handleFileChange} />
              <Button onClick={handleParse} disabled={!csvFile || isLoading} className="w-full">
                <Upload className="h-4 w-4 mr-2" />{isLoading ? '解析中...' : '解析を実行'}
              </Button>
            </div>
          )}

          {step === 2 && parseResult && (
             <div>
                <Card className="mb-4">
                  <CardHeader><CardTitle>解析結果</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-3 gap-4 text-center">
                    <div><p className="text-sm text-gray-500">総商品種類</p><p className="text-2xl font-bold">{stats.total}</p></div>
                    <div className="text-green-600"><p className="text-sm">マッチ済み</p><p className="text-2xl font-bold">{stats.matched}</p></div>
                    <div className="text-yellow-600"><p className="text-sm">未マッチ</p><p className="text-2xl font-bold">{stats.unmatched}</p></div>
                  </CardContent>
                </Card>
                <div className="flex gap-4">
                   <Button variant="outline" onClick={() => setStep(1)} className="flex-1">戻る</Button>
                   <Button onClick={() => setStep(3)} className="flex-1"><Edit2 className="mr-2 h-4 w-4"/>マッチングを修正</Button>
                   <Button onClick={handleConfirm} disabled={isLoading || stats.matched === 0} className="flex-1">インポート実行</Button>
                </div>
             </div>
          )}
          
          {step === 3 && (
            <div>
              <div className="space-y-3 max-h-96 overflow-y-auto mb-4 p-2 border rounded-md">
                {allMappings.map((m, i) => (
                  <div key={i} className={`p-3 rounded-lg ${m.productId ? 'bg-green-50' : 'bg-yellow-50'}`}>
                    <p className="font-semibold text-sm">{m.mercariTitle} <span className="text-xs">({m.quantity}個)</span></p>
                    <div className="flex items-center gap-2 mt-2">
                      <select 
                        value={m.productId} 
                        onChange={(e) => handleMappingChange(i, e.target.value)}
                        className="flex-grow p-2 border rounded-md text-sm"
                      >
                        <option value="">-- 商品を選択 --</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {m.productId && (
                        <Button size="sm" disabled={m.isLearned || savingMapping === m.mercariTitle} onClick={() => handleLearnMapping(i)}>
                          {savingMapping === m.mercariTitle ? '学習中...' : (m.isLearned ? <><Check className="h-4 w-4 mr-1"/>学習済</> : <><Save className="h-4 w-4 mr-1"/>学習</>)}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-4">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1"><ArrowLeft className="mr-2 h-4 w-4"/>戻る</Button>
                <Button onClick={handleConfirm} disabled={isLoading || stats.matched === 0} className="flex-1">インポート実行</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
