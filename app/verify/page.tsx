// /app/verify/page.tsx ver.3 (デバッグボタン追加版)

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Upload, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface VerificationResult {
  productId: string;
  productName: string;
  series: string;
  csvCount: number;
  dbCount: number;
  isMatch: boolean;
}

export default function VerifyPage() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [channel, setChannel] = useState<'amazon' | 'rakuten'>('rakuten');
  const [saleMonth, setSaleMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [summary, setSummary] = useState<{match: number, mismatch: number, total: number} | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setError('');
      setResults([]);
      setSummary(null);
    }
  };

  const handleVerification = async () => {
    if (!csvFile) {
      setError('CSVファイルを選択してください');
      return;
    }
    
    setIsLoading(true);
    setError('');
    setResults([]);
    setSummary(null);

    try {
      const csvContent = await csvFile.text();
      const apiEndpoint = channel === 'amazon' 
        ? '/api/verify/amazon-sales' 
        : '/api/verify/rakuten-sales';
        
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent, saleMonth }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '検証処理でエラーが発生しました');
      }

      setResults(data.results);
      const matchCount = data.results.filter((r: VerificationResult) => r.isMatch).length;
      const mismatchCount = data.results.length - matchCount;
      setSummary({ match: matchCount, mismatch: mismatchCount, total: data.results.length });

    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーです');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDebugCsv = () => {
    if (csvFile) {
      const formData = new FormData();
      formData.append('csvFile', csvFile);
      fetch('/api/debug/amazon-csv', { method: 'POST', body: formData })
        .then(r => r.json())
        .then(result => {
          console.log('=== CSV構造デバッグ結果 ===');
          console.log(result);
        })
        .catch(console.error);
    }
  };

  const channelDisplayName = channel === 'amazon' ? 'Amazon' : '楽天';
  const channelColor = channel === 'amazon' ? 'orange' : 'red';

  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>{channelDisplayName}売上データ 整合性チェック</CardTitle>
          <p className="text-gray-600 text-sm">
            CSVファイルとデータベースに登録された売上データを比較し、数量が一致しているか確認します。
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
              <span className="text-red-600 text-sm">{error}</span>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">① ECサイトを選択</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as 'amazon' | 'rakuten')}
                className="border rounded-md p-2 w-full"
              >
                <option value="rakuten">楽天</option>
                <option value="amazon">Amazon</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">② 売上月を選択</label>
              <input
                type="month"
                value={saleMonth}
                onChange={(e) => setSaleMonth(e.target.value)}
                className="border rounded-md p-2 w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">③ 対象のCSVファイルを選択</label>
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="verify-csv-upload" className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-3 rounded-md border border-gray-300">
                  ファイル選択
                </label>
                <Input
                  id="verify-csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <span className="text-gray-600">{csvFile ? csvFile.name : '選択されていません'}</span>
              </div>
            </div>
          </div>
          
          <Button onClick={handleVerification} disabled={!csvFile || isLoading} className="w-full">
            <Upload className="h-4 w-4 mr-2" />
            {isLoading ? '検証中...' : `${channelDisplayName}データの答え合わせを実行`}
          </Button>

          {channel === 'amazon' && csvFile && (
            <Button 
              onClick={handleDebugCsv}
              variant="outline" 
              className="w-full"
            >
              🔍 CSV構造デバッグ
            </Button>
          )}

          {summary && (
            <div className={`p-4 bg-${channelColor}-50 rounded-lg text-center border border-${channelColor}-200`}>
              <h3 className="font-bold text-lg">検証結果</h3>
              <p>
                全 {summary.total} 商品中、
                <span className="text-green-600 font-bold mx-1">{summary.match}件が一致</span>、
                <span className="text-red-600 font-bold mx-1">{summary.mismatch}件が不一致</span>
                でした。
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div>
              <h3 className="font-bold text-lg mb-2">詳細結果</h3>
              <div className="max-h-[50vh] overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">シリーズ</th>
                      <th className="p-2 text-left">商品名</th>
                      <th className="p-2 text-center">CSVの数量</th>
                      <th className="p-2 text-center">DBの数量</th>
                      <th className="p-2 text-center">結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.productId} className={`border-t ${!r.isMatch ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                        <td className="p-2 text-xs text-gray-600">{r.series}</td>
                        <td className="p-2 font-medium">{r.productName}</td>
                        <td className="p-2 text-center">{r.csvCount}</td>
                        <td className="p-2 text-center">{r.dbCount}</td>
                        <td className={`p-2 text-center font-bold flex justify-center items-center gap-1 ${r.isMatch ? 'text-green-600' : 'text-red-600'}`}>
                          {r.isMatch ? <CheckCircle size={16} /> : <XCircle size={16} />}
                          {r.isMatch ? '一致' : '不一致'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
