// /app/verify/page.tsx ver.4
// Yahoo検証機能統合版（Amazon/楽天ベース）

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Upload, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface VerificationResult {
  product_id: string;
  product_name: string;
  csv_count: number;
  db_count: number;
  difference: number;
  is_match: boolean;
}

interface VerificationSummary {
  total_products: number;
  matched_products: number;
  mismatched_products: number;
  csv_total_quantity: number;
  db_total_quantity: number;
  total_difference: number;
}

export default function VerifyPage() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [channel, setChannel] = useState<'amazon' | 'rakuten' | 'yahoo'>('yahoo');
  const [targetMonth, setTargetMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [summary, setSummary] = useState<VerificationSummary | null>(null);

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
      const csvData = await csvFile.text();
      
      // チャンネル別APIエンドポイント
      const apiEndpoint = `/api/verify/${channel}-sales`;
        
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          csvData: csvData,
          targetMonth: targetMonth,
          // 旧API互換性のため
          csvContent: csvData,
          saleMonth: targetMonth
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '検証処理でエラーが発生しました');
      }

      // レスポンス形式統一（新形式優先、旧形式フォールバック）
      const verificationResults = data.verification_results || data.results || [];
      const verificationSummary = data.summary;

      setResults(verificationResults);
      setSummary(verificationSummary);

    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーです');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDebugCsv = () => {
    if (csvFile && channel === 'amazon') {
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

  // チャンネル設定
  const channelConfig = {
    amazon: { name: 'Amazon', color: 'orange', bgColor: 'orange-50', borderColor: 'orange-200' },
    rakuten: { name: '楽天', color: 'red', bgColor: 'red-50', borderColor: 'red-200' },
    yahoo: { name: 'Yahoo', color: 'purple', bgColor: 'purple-50', borderColor: 'purple-200' }
  };

  const config = channelConfig[channel];

  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className={`h-5 w-5 text-${config.color}-600`} />
            {config.name}売上データ 整合性チェック
          </CardTitle>
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
                onChange={(e) => setChannel(e.target.value as 'amazon' | 'rakuten' | 'yahoo')}
                className="border rounded-md p-2 w-full"
              >
                <option value="yahoo">Yahoo</option>
                <option value="rakuten">楽天</option>
                <option value="amazon">Amazon</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">② 売上月を選択</label>
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
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
          
          <Button 
            onClick={handleVerification} 
            disabled={!csvFile || isLoading} 
            className={`w-full bg-${config.color}-600 hover:bg-${config.color}-700`}
          >
            <Upload className="h-4 w-4 mr-2" />
            {isLoading ? '検証中...' : `${config.name}データの答え合わせを実行`}
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
            <div className={`p-4 bg-${config.bgColor} rounded-lg text-center border border-${config.borderColor}`}>
              <h3 className="font-bold text-lg">検証結果サマリー</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3 text-sm">
                <div className="bg-white p-3 rounded border">
                  <div className="text-gray-600">総商品数</div>
                  <div className={`text-lg font-bold text-${config.color}-600`}>
                    {summary.total_products}件
                  </div>
                </div>
                <div className="bg-white p-3 rounded border">
                  <div className="text-gray-600">一致商品</div>
                  <div className="text-lg font-bold text-green-600">
                    {summary.matched_products}件
                  </div>
                </div>
                <div className="bg-white p-3 rounded border">
                  <div className="text-gray-600">不一致商品</div>
                  <div className="text-lg font-bold text-red-600">
                    {summary.mismatched_products}件
                  </div>
                </div>
                <div className="bg-white p-3 rounded border">
                  <div className="text-gray-600">CSV合計数量</div>
                  <div className="text-lg font-bold text-blue-600">
                    {summary.csv_total_quantity}
                  </div>
                </div>
                <div className="bg-white p-3 rounded border">
                  <div className="text-gray-600">DB合計数量</div>
                  <div className="text-lg font-bold text-blue-600">
                    {summary.db_total_quantity}
                  </div>
                </div>
                <div className="bg-white p-3 rounded border">
                  <div className="text-gray-600">差分</div>
                  <div className={`text-lg font-bold ${summary.total_difference === 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {summary.total_difference > 0 ? '+' : ''}{summary.total_difference}
                  </div>
                </div>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div>
              <h3 className="font-bold text-lg mb-2">詳細結果</h3>
              <div className="max-h-[50vh] overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">商品名</th>
                      <th className="p-2 text-center">CSVの数量</th>
                      <th className="p-2 text-center">DBの数量</th>
                      <th className="p-2 text-center">差分</th>
                      <th className="p-2 text-center">結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.product_id} className={`border-t ${!r.is_match ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                        <td className="p-2 font-medium" title={r.product_name}>
                          <div className="max-w-xs truncate">{r.product_name}</div>
                        </td>
                        <td className="p-2 text-center">{r.csv_count}</td>
                        <td className="p-2 text-center">{r.db_count}</td>
                        <td className={`p-2 text-center font-medium ${r.difference === 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {r.difference > 0 ? '+' : ''}{r.difference}
                        </td>
                        <td className={`p-2 text-center font-bold ${r.is_match ? 'text-green-600' : 'text-red-600'}`}>
                          <div className="flex justify-center items-center gap-1">
                            {r.is_match ? <CheckCircle size={16} /> : <XCircle size={16} />}
                            {r.is_match ? '一致' : '不一致'}
                          </div>
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
