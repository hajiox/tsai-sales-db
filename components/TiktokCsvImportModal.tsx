// app/components/TiktokCsvImportModal.tsx ver.1
'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, CheckCircle, AlertCircle, BookOpen } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface Product {
  id: string;
  name: string;
  series: string | null;
  price: number;
}

interface ParsedItem {
  title: string;
  count: number;
  saleDate: string;
  productId: string | null;
  isLearned: boolean;
}

interface TiktokCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export default function TiktokCsvImportModal({ 
  isOpen, 
  onClose, 
  onImportComplete 
}: TiktokCsvImportModalProps) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<{
    learned: ParsedItem[];
    unlearned: ParsedItem[];
  }>({ learned: [], unlearned: [] });
  const [products, setProducts] = useState<Product[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const supabase = createClientComponentClient();

  // 商品一覧取得
  useEffect(() => {
    if (isOpen && step === 3) {
      fetchProducts();
    }
  }, [isOpen, step]);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, series, price')
        .order('series', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('商品一覧の取得エラー:', err);
      setError('商品一覧の取得に失敗しました');
    }
  };

  // ファイル選択
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  // Step2: CSV解析
  const handleParse = async () => {
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const csvText = await file.text();

      const response = await fetch('/api/import/tiktok-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'CSVの解析に失敗しました');
      }

      const data = await response.json();
      setParsedData(data.results);

      if (data.results.unlearned.length > 0) {
        setStep(3); // 未学習商品がある場合はStep3へ
      } else {
        setStep(4); // 全て学習済みの場合はStep4へ
      }
    } catch (err) {
      console.error('Parse エラー:', err);
      setError(err instanceof Error ? err.message : 'CSVの解析に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step3: 未学習商品の割り当て
  const handleAssignProduct = (title: string, productId: string) => {
    setAssignments(prev => ({
      ...prev,
      [title]: productId
    }));
  };

  // Step3→Step4: 学習を実行
  const handleLearnAndProceed = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // 割り当てられた商品を学習
      const learnPromises = Object.entries(assignments).map(([title, productId]) =>
        fetch('/api/import/tiktok-learn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, productId })
        })
      );

      await Promise.all(learnPromises);

      // 未学習商品を学習済みに移動
      const newLearned = parsedData.unlearned
        .filter(item => assignments[item.title])
        .map(item => ({
          ...item,
          productId: assignments[item.title],
          isLearned: true
        }));

      setParsedData(prev => ({
        learned: [...prev.learned, ...newLearned],
        unlearned: prev.unlearned.filter(item => !assignments[item.title])
      }));

      setStep(4);
    } catch (err) {
      console.error('学習エラー:', err);
      setError('学習データの保存に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step3→Step4: 学習をスキップ
  const handleSkipLearning = () => {
    setStep(4);
  };

  // Step4: 確定
  const handleConfirm = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const itemsToConfirm = parsedData.learned;

      if (itemsToConfirm.length === 0) {
        setError('確定するデータがありません');
        return;
      }

      const response = await fetch('/api/import/tiktok-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToConfirm })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'データの確定に失敗しました');
      }

      setSuccessMessage(`${itemsToConfirm.length}件のデータを正常にインポートしました`);
      setStep(5);

      // 親コンポーネントに完了を通知
      setTimeout(() => {
        onImportComplete();
        handleClose();
      }, 2000);
    } catch (err) {
      console.error('Confirm エラー:', err);
      setError(err instanceof Error ? err.message : 'データの確定に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // モーダルを閉じる
  const handleClose = () => {
    setStep(1);
    setFile(null);
    setError(null);
    setParsedData({ learned: [], unlearned: [] });
    setAssignments({});
    setSuccessMessage(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            TikTokショップ CSV インポート
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step Indicator */}
          <div className="flex items-center justify-between mb-6">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    s <= step
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {s}
                </div>
                {s < 5 && (
                  <div
                    className={`w-16 h-1 ${
                      s < step ? 'bg-blue-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success Alert */}
          {successMessage && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* Step 1: ファイル選択 */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="csv-file">TikTokショップのCSVファイルを選択</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="mt-2"
                />
              </div>
              {file && (
                <p className="text-sm text-gray-600">
                  選択されたファイル: {file.name}
                </p>
              )}
              <Button
                onClick={() => setStep(2)}
                disabled={!file}
                className="w-full"
              >
                次へ
              </Button>
            </div>
          )}

          {/* Step 2: CSV解析 */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                CSVファイルを解析しています...
              </p>
              <Button
                onClick={handleParse}
                disabled={isProcessing}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    解析中...
                  </>
                ) : (
                  '解析開始'
                )}
              </Button>
            </div>
          )}

          {/* Step 3: 未学習商品の割り当て */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <p className="text-sm text-yellow-800">
                  <BookOpen className="inline h-4 w-4 mr-1" />
                  未学習の商品が {parsedData.unlearned.length} 件あります。
                  商品マスターから該当する商品を選択してください。
                </p>
              </div>

              <div className="max-h-96 overflow-y-auto space-y-3">
                {parsedData.unlearned.map((item, index) => (
                  <div key={index} className="border rounded-md p-3">
                    <div className="flex flex-col gap-2">
                      <div>
                        <span className="font-medium text-sm">TikTok商品名:</span>
                        <p className="text-sm text-gray-700">{item.title}</p>
                        <p className="text-xs text-gray-500">
                          個数: {item.count} / 売上月: {item.saleDate}
                        </p>
                      </div>
                      <select
                        className="border rounded-md p-2 text-sm"
                        value={assignments[item.title] || ''}
                        onChange={(e) => handleAssignProduct(item.title, e.target.value)}
                      >
                        <option value="">商品を選択...</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.series || '未分類'} - {product.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleLearnAndProceed}
                  disabled={
                    isProcessing ||
                    Object.keys(assignments).length === 0
                  }
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      学習中...
                    </>
                  ) : (
                    '学習して次へ'
                  )}
                </Button>
                <Button
                  onClick={handleSkipLearning}
                  variant="outline"
                  disabled={isProcessing}
                  className="flex-1"
                >
                  学習せずに次へ
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: 確認 */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <p className="text-sm text-blue-800">
                  <CheckCircle className="inline h-4 w-4 mr-1" />
                  学習済み商品: {parsedData.learned.length} 件
                </p>
                {parsedData.unlearned.length > 0 && (
                  <p className="text-sm text-yellow-800 mt-1">
                    <AlertCircle className="inline h-4 w-4 mr-1" />
                    未学習商品: {parsedData.unlearned.length} 件（インポート対象外）
                  </p>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-left">商品名</th>
                      <th className="p-2 text-right">個数</th>
                      <th className="p-2 text-left">売上月</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.learned.map((item, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2">{item.title}</td>
                        <td className="p-2 text-right">{item.count}</td>
                        <td className="p-2">{item.saleDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button
                onClick={handleConfirm}
                disabled={isProcessing || parsedData.learned.length === 0}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    確定中...
                  </>
                ) : (
                  '確定してインポート'
                )}
              </Button>
            </div>
          )}

          {/* Step 5: 完了 */}
          {step === 5 && (
            <div className="text-center py-8">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-semibold text-gray-900">
                インポート完了
              </p>
              <p className="text-sm text-gray-600 mt-2">
                {successMessage}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
