// /components/RakutenCsvImportModal.tsx ver.4 - JSONパースエラー修正版

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, Upload, AlertCircle } from 'lucide-react';

interface RakutenCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RakutenCsvImportModal({ 
  isOpen, 
  onClose, 
  onSuccess 
}: RakutenCsvImportModalProps) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setParseResult(null);
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
      const csvContent = await csvFile.text();
      
      const response = await fetch('/api/import/rakuten-parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvContent }),
      });

      // レスポンステキストを先に取得
      const responseText = await response.text();
      console.log('楽天API生レスポンス:', responseText);

      // JSONパースを安全に実行
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('JSONパースエラー:', jsonError);
        throw new Error(`レスポンスのJSONパースに失敗: ${responseText.substring(0, 100)}...`);
      }

      if (!result.success) {
        throw new Error(result.error || '楽天CSVの解析に失敗しました');
      }

      setParseResult(result);
    } catch (error) {
      console.error('楽天CSV解析エラー:', error);
      setError(error instanceof Error ? error.message : '不明なエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!parseResult) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/import/rakuten-confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          saleDate: '2025-03-01', // 固定日付
          matchedProducts: parseResult.matchedProducts || [],
          newMappings: [] // 新規マッピングは空
        }),
      });

      const responseText = await response.text();
      console.log('楽天確定API生レスポンス:', responseText);

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('確定APIのJSONパースエラー:', jsonError);
        throw new Error(`確定APIレスポンスのJSONパースに失敗: ${responseText.substring(0, 100)}...`);
      }

      if (!result.success) {
        throw new Error(result.error || '楽天CSVの確定に失敗しました');
      }

      alert(`楽天CSVデータが正常に登録されました\n登録件数: ${result.insertedSales}件`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('楽天CSV確定エラー:', error);
      setError(error instanceof Error ? error.message : '確定処理中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">楽天CSV インポート</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6">
          <p className="text-gray-600 mb-4">
            楽天市場の商品別売上CSVをアップロードしてください。商品名のマッチング確認画面を経由して楽天列のみを更新します。
          </p>

          {error && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-red-600">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">楽天CSV ファイル:</label>
            <Input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="mb-2"
            />
            <Button 
              onClick={handleParse}
              disabled={!csvFile || isLoading}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              {isLoading ? '解析中...' : '次へ（確認画面）'}
            </Button>
          </div>

          {parseResult && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    📊 数量チェック
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-gray-600">CSV総商品数</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {parseResult.totalProducts}件
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600">総販売数量</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {parseResult.totalQuantity}個
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600">処理可能数量</div>
                    <div className="text-2xl font-bold text-green-600">
                      {parseResult.processableQuantity}個
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-green-50">
                  <CardHeader>
                    <CardTitle className="text-green-700">マッチ済み</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {parseResult.matchedProducts?.length || 0}件
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-yellow-50">
                  <CardHeader>
                    <CardTitle className="text-yellow-700">未マッチ</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">
                      {parseResult.unmatchedProducts?.length || 0}件
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} className="flex-1">
                  キャンセル
                </Button>
                <Button 
                  onClick={handleConfirm}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? '処理中...' : 'インポート実行'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
