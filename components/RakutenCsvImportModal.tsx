// /components/RakutenCsvImportModal.tsx ver.1

'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>楽天CSV インポート</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {step === 'upload' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="saleDate">売上日</Label>
              <Input
                id="saleDate"
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="csvFile">楽天CSV ファイル</Label>
              <Input
                id="csvFile"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                楽天市場の商品別売上CSVをアップロードしてください（8行目から商品データを読み取ります）
              </p>
            </div>

            <Button 
              onClick={parseCSV} 
              disabled={loading || !file || !saleDate}
              className="w-full"
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
            </Button>
          </div>
        )}

        {step === 'confirm' && parseResult && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-green-50 p-3 rounded">
                <div className="font-semibold text-green-800">マッチ済み</div>
                <div className="text-green-600">{parseResult.matchedProducts.length}件</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded">
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
                      <Select
                        value={newMappings[item.rakutenTitle] || ''}
                        onValueChange={(value) => handleMappingChange(item.rakutenTitle, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="商品を選択..." />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.series} - {product.product_number} ({product.series_code}-{product.product_code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setStep('upload')}
                disabled={loading}
              >
                戻る
              </Button>
              <Button 
                onClick={confirmImport}
                disabled={loading}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    インポート中...
                  </>
                ) : (
                  'インポート実行'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
