// /app/verify/page.tsx  ver.7
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
  /* ---------------- state ----------------- */
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [channel, setChannel] = useState<'amazon' | 'rakuten' | 'yahoo'>('yahoo');
  const [targetMonth, setTargetMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [summary, setSummary] = useState<VerificationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  /* -------------- handlers --------------- */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvFile(e.target.files?.[0] || null);
    setError(''); setResults([]); setSummary(null);
  };

  const handleVerification = async () => {
    if (!csvFile) { setError('CSVファイルを選択してください'); return; }

    setIsLoading(true); setError(''); setResults([]); setSummary(null);
    try {
      const fd = new FormData();
      fd.append('file', csvFile);
      fd.append('saleMonth', targetMonth);

      const res = await fetch(`/api/verify/${channel}-sales`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!data.success)
        throw new Error(data.error || '検証 API でエラーが発生しました');

      setResults(data.results || data.verification_results || []);
      setSummary(data.summary || null);
    } catch (e:any) {
      setError(e.message || '不明なエラー');
    } finally {
      setIsLoading(false);
    }
  };

  const channelConfig = {
    amazon: { name: 'Amazon', color: 'orange', bg: 'orange-50', border: 'orange-200' },
    rakuten: { name: '楽天',   color: 'red',    bg: 'red-50',    border: 'red-200' },
    yahoo:  { name: 'Yahoo',  color: 'purple', bg: 'purple-50', border: 'purple-200' },
  } as const;
  const cfg = channelConfig[channel];

  /* ---------------- JSX ------------------ */
  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className={`h-5 w-5 text-${cfg.color}-600`} />
            {cfg.name}売上データ 整合性チェック
          </CardTitle>
          <p className="text-gray-600 text-sm">
            CSV と DB の月次売上数量を比較し、不一致を検出します。
          </p>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* エラー表示 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
              <span className="text-red-600 text-sm">{error}</span>
            </div>
          )}

          {/* 入力フォーム */}
          <div className="grid md:grid-cols-3 gap-4">
            {/* チャネル */}
            <div>
              <label className="block text-sm font-medium mb-1">① ECサイト</label>
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
            {/* 月 */}
            <div>
              <label className="block text-sm font-medium mb-1">② 売上月</label>
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="border rounded-md p-2 w-full"
              />
            </div>
            {/* ファイル */}
            <div>
              <label className="block text-sm font-medium mb-1">③ CSV ファイル</label>
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="verify-upload" className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-3 rounded-md border border-gray-300">
                  ファイル選択
                </label>
                <Input
                  id="verify-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <span className="text-gray-600">
                  {csvFile ? csvFile.name : '選択されていません'}
                </span>
              </div>
            </div>
          </div>

          {/* 実行ボタン */}
          <Button
            onClick={handleVerification}
            disabled={!csvFile || isLoading}
            className={`w-full bg-${cfg.color}-600 hover:bg-${cfg.color}-700`}
          >
            <Upload className="h-4 w-4 mr-2" />
            {isLoading ? '検証中...' : `${cfg.name} データを検証`}
          </Button>

          {/* サマリー */}
          {summary && (
            <div className={`p-4 bg-${cfg.bg} rounded-lg text-center border border-${cfg.border}`}>
              <h3 className="font-bold text-lg">検証結果サマリー</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3 text-sm">
                <div><div className="text-gray-600">総商品数</div><div className={`text-lg font-bold text-${cfg.color}-600`}>{summary.total_products} 件</div></div>
                <div><div className="text-gray-600">一致商品</div><div className="text-lg font-bold text-green-600">{summary.matched_products} 件</div></div>
                <div><div className="text-gray-600">不一致商品</div><div className="text-lg font-bold text-red-600">{summary.mismatched_products} 件</div></div>
                <div><div className="text-gray-600">CSV 合計</div><div className="text-lg font-bold text-blue-600">{summary.csv_total_quantity}</div></div>
                <div><div className="text-gray-600">DB 合計</div><div className="text-lg font-bold text-blue-600">{summary.db_total_quantity}</div></div>
                <div><div className="text-gray-600">差分</div><div className={`text-lg font-bold ${summary.total_difference===0?'text-green-600':'text-red-600'}`}>{summary.total_difference > 0 ? '+' : ''}{summary.total_difference}</div></div>
              </div>
            </div>
          )}

          {/* 詳細 */}
          {results.length > 0 && (
            <div>
              <h3 className="font-bold text-lg mb-2">詳細結果</h3>
              <div className="max-h-[50vh] overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">商品名</th>
                      <th className="p-2 text-center">CSV</th>
                      <th className="p-2 text-center">DB</th>
                      <th className="p-2 text-center">差分</th>
                      <th className="p-2 text-center">結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(r => (
                      <tr key={r.product_id} className={`border-t ${r.is_match ? '' : 'bg-red-50'} hover:bg-gray-50`}>
                        <td className="p-2 font-medium"><div className="max-w-xs truncate" title={r.product_name}>{r.product_name}</div></td>
                        <td className="p-2 text-center">{r.csv_count}</td>
                        <td className="p-2 text-center">{r.db_count}</td>
                        <td className={`p-2 text-center font-medium ${r.difference===0?'text-green-600':'text-red-600'}`}>{r.difference>0?'+':''}{r.difference}</td>
                        <td className={`p-2 text-center font-bold ${r.is_match?'text-green-600':'text-red-600'}`}>
                          <div className="flex justify-center items-center gap-1">
                            {r.is_match ? <CheckCircle size={16}/> : <XCircle size={16}/> }
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
