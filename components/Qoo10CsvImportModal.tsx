// /components/Qoo10CsvImportModal.tsx ver.1
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Upload, AlertCircle, Edit2, Check, Save, ArrowLeft } from 'lucide-react';

// 他のモーダルと共通のデータ型定義
interface Product {
  id: string;
  name: string;
}

interface Qoo10CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  products: Product[];
}

export default function Qoo10CsvImportModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  products
}: Qoo10CsvImportModalProps) {
  const [step, setStep] = useState(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  // 修正UIでマッピングを管理するための状態
  const [allMappings, setAllMappings] = useState<Array<{
    qoo10Title: string;
    productId: string;
    productName: string;
    quantity: number;
    isLearned?: boolean;
  }>>([]);
  const [savingMapping, setSavingMapping] = useState<string | null>(null);

  // モーダルが閉じたときに状態をリセット
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

  // 解析結果から修正用マッピングリストを作成
  useEffect(() => {
    if (parseResult) {
      const matched = parseResult.matchedProducts || [];
      const unmatched = parseResult.unmatchedProducts || [];
      
      const combined = [
        ...matched.map((m: any) => ({
          qoo10Title: m.qoo10Title,
          productId: m.productInfo?.id || '',
          productName: m.productInfo?.name || '',
          quantity: m.quantity,
          isLearned: m.isLearned || false
        })),
        ...unmatched.map((u: any) => ({
          qoo10Title: u.qoo10Title,
          productId: '',
          productName: '',
          quantity: u.quantity,
          isLearned: false
        }))
      ];
      setAllMappings(combined);
    }
  }, [parseResult]);

  if (!isOpen) return null;

  // ファイル選択ハンドラ
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setError('');
      setParseResult(null);
    }
  };

  // ステップ1: CSV解析処理
  const handleParse = async () => {
    if (!csvFile) {
      setError('CSVファイルを選択してください。');
      return;
    }
    setIsLoading(true);
    setError('');
    
    try {
      const formData = new FormData();
      formData.append('file', csvFile);

      const response = await fetch('/api/import/qoo10-parse', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!result.success) throw new Error(result.error || 'CSVの解析に失敗しました。');
      
      setParseResult(result);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 修正画面での個別学習ハンドラ
  const handleLearnMapping = async (index: number) => {
    const mapping = allMappings[index];
    if (!mapping.productId || mapping.isLearned) return;

    setSavingMapping(mapping.qoo10Title);
    try {
      const response = await fetch('/api/import/qoo10-learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qoo10Title: mapping.qoo10Title,
          productId: mapping.productId
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || '学習に失敗しました。');

      setAllMappings(prev => prev.map((m, i) => i === index ? { ...m, isLearned: true } : m));
    } catch (err) {
      alert('学習エラー: ' + (err instanceof Error ? err.message : '不明なエラー'));
    } finally {
      setSavingMapping(null);
    }
  };

  // 修正画面でのマッピング変更ハンドラ
  const handleMappingChange = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    setAllMappings(prev => prev.map((m, i) => 
      i === index ? { 
        ...m, 
        productId, 
        productName: product?.name || '',
        isLearned: false // 変更したら学習状態をリセット
      } : m
    ));
  };
  
  // 最終的なインポート確定処理
  const handleConfirm = async () => {
    setIsLoading(true);
    setError('');
    
    // Step3で修正されたデータ、またはStep2の解析結果データを使用
    const mappingsToConfirm = step === 3 ? allMappings : parseResult.matchedProducts;
    
    // productIdが設定されている有効なマッピングのみを抽出
    const validMappings = mappingsToConfirm
      .filter((m: any) => m.productId || m.productInfo?.id)
      .map((m: any) => ({
          qoo10Title: m.qoo10Title,
          quantity: m.quantity,
          productId: m.productId || m.productInfo.id
      }));

    try {
      const response = await fetch('/api/import/qoo10-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesData: validMappings, targetMonth: '2025-07-01' }), // targetMonthは仮
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'インポートに失敗しました。');

      alert(`Qoo10の売上データを登録しました。\n登録件数: ${result.importedCount}件`);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 統計情報を計算
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
          <CardTitle>Qoo10 CSV インポート</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X/></Button>
        </CardHeader>
        <div className="p-6 overflow-y-auto">
          {error && <p className="text-red-500 mb-4">{error}</p>}
          
          {step === 1 && (
            <div>
              <p className="text-gray-600 mb-4">Qoo10の売上CSVファイルをアップロードしてください。</p>
              <Input type="file" accept=".csv" onChange={handleFileChange} />
              <Button onClick={handleParse} disabled={!csvFile || isLoading} className="w-full mt-4">
                {isLoading ? '解析中...' : '次へ進む'}
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
                    <p className="font-semibold text-sm">{m.qoo10Title} <span className="text-xs">({m.quantity}個)</span></p>
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
                        <Button
                          size="sm"
                          disabled={m.isLearned || savingMapping === m.qoo10Title}
                          onClick={() => handleLearnMapping(i)}
                        >
                          {savingMapping === m.qoo10Title ? '学習中...' : (m.isLearned ? <><Check className="h-4 w-4 mr-1"/>学習済</> : <><Save className="h-4 w-4 mr-1"/>学習</>)}
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
