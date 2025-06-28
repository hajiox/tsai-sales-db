// /components/RakutenCsvImportModal.tsx ver.15 (Amazon方式への完全統一版)
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Upload, AlertCircle, ArrowRight, ArrowLeft, FileText, AlertTriangle } from 'lucide-react';

interface Product {
 id: string;
 name: string;
 series: string;
 series_code: number;
 product_code: number;
}

interface RakutenCsvImportModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSuccess: () => void;
 products: Product[];
}

export default function RakutenCsvImportModal({ 
 isOpen, 
 onClose, 
 onSuccess,
 products
}: RakutenCsvImportModalProps) {
 const [step, setStep] = useState(1);
 const [csvFile, setCsvFile] = useState<File | null>(null);
 const [parseResult, setParseResult] = useState<any>(null);
 const [newMappings, setNewMappings] = useState<Array<{rakutenTitle: string; productId: string; quantity: number}>>([]);
 const [currentUnmatchIndex, setCurrentUnmatchIndex] = useState(0);
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string>('');
 const [saleMonth, setSaleMonth] = useState<string>(() => {
   const now = new Date();
   return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
 });

 useEffect(() => {
   if (!isOpen) {
     setStep(1);
     setCsvFile(null);
     setParseResult(null);
     setNewMappings([]);
     setCurrentUnmatchIndex(0);
     setError('');
   }
 }, [isOpen]);

 if (!isOpen) return null;

 const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
   const file = e.target.files?.[0];
   if (file) {
     setCsvFile(file);
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
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ csvContent }),
     });
     const result = await response.json();
     if (!result.success) {
       throw new Error(result.error || '楽天CSVの解析に失敗しました');
     }
     setParseResult(result);
     setStep(2);
   } catch (error) {
     console.error('楽天CSV解析エラー:', error);
     setError(error instanceof Error ? error.message : '不明なエラーが発生しました');
   } finally {
     setIsLoading(false);
   }
 };

 const handleStartUnmatchFix = () => {
   setStep(3);
   setCurrentUnmatchIndex(0);
 };

 const handleProductSelect = (productId: string) => {
   const currentUnmatch = parseResult.unmatchedProducts[currentUnmatchIndex];
   if (productId !== 'skip') {
     const mapping = {
       rakutenTitle: currentUnmatch.rakutenTitle,
       productId: productId,
       quantity: currentUnmatch.quantity
     };
     setNewMappings(prev => [...prev, mapping]);
   }
   if (currentUnmatchIndex < parseResult.unmatchedProducts.length - 1) {
     setCurrentUnmatchIndex(currentUnmatchIndex + 1);
   } else {
     setStep(2);
   }
 };

 const handleConfirm = async () => {
   if (!parseResult) return;
   setIsLoading(true);
   setError('');
   try {
     const requestData = {
       saleDate: `${saleMonth}-01`,
       matchedProducts: parseResult.matchedProducts || [],
       newMappings: newMappings,
     };
     const response = await fetch('/api/import/rakuten-confirm', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(requestData),
     });
     const result = await response.json();
     if (!result.success) {
       throw new Error(result.error || '楽天CSVの確定に失敗しました');
     }
     alert(`楽天CSVデータが正常に登録されました\n登録件数: ${result.totalCount}件`);
     onSuccess();
   } catch (error) {
     console.error('楽天CSV確定エラー:', error);
     setError(error instanceof Error ? error.message : '確定処理中にエラーが発生しました');
   } finally {
     setIsLoading(false);
   }
 };

 const currentUnmatch = parseResult?.unmatchedProducts?.[currentUnmatchIndex];
 const progress = parseResult?.unmatchedProducts?.length > 0 
   ? ((currentUnmatchIndex + 1) / parseResult.unmatchedProducts.length) * 100 
   : 0;

 return (
   <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
     <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
       <div className="flex justify-between items-center p-6 border-b">
         <h2 className="text-xl font-bold">楽天CSV インポート</h2>
         <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
       </div>
       <div className="p-6">
         {step === 1 && (
           <>
             <p className="text-gray-600 mb-4">楽天市場の商品別売上CSVをアップロードしてください。</p>
             {error && (
               <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                 <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                 <span className="text-red-600 text-sm">{error}</span>
               </div>
             )}
             <div className="mb-6">
               <label className="block text-sm font-medium mb-2">楽天CSV ファイル:</label>
               <div className="flex items-center gap-4 p-4 border-2 border-dashed rounded-lg">
                 <label htmlFor="rakuten-csv-upload" className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded-md border border-gray-300 transition-colors">ファイルを選択</label>
                 <Input id="rakuten-csv-upload" type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                 <div className="flex items-center gap-2 text-gray-600">
                   <FileText className="h-5 w-5 text-gray-400" />
                   <span>{csvFile ? csvFile.name : '選択されていません'}</span>
                 </div>
               </div>
               <Button onClick={handleParse} disabled={!csvFile || isLoading} className="w-full mt-4">
                 <Upload className="h-4 w-4 mr-2" />{isLoading ? '解析中...' : '次へ（確認画面）'}
               </Button>
             </div>
           </>
         )}

         {step === 2 && parseResult && (
           <>
            {/* ★★★ ここからが変更点 ★★★ */}
            <div className="max-h-60 overflow-y-auto border rounded-lg mb-4">
             <table className="w-full text-sm">
               <thead className="bg-gray-50 sticky top-0">
                 <tr>
                   <th className="p-2 text-left">楽天商品名</th>
                   <th className="p-2 text-left">マッチした商品</th>
                   <th className="p-2 text-center">数量</th>
                   <th className="p-2 text-center">精度</th>
                 </tr>
               </thead>
               <tbody>
                 {parseResult.matchedProducts.map((match: any, index: number) => (
                   <tr key={index} className="border-t hover:bg-gray-50">
                     <td className="p-2 text-xs">
                       <div className="font-medium text-orange-700">{match.rakutenTitle}</div>
                     </td>
                     <td className="p-2">
                       {/* `productInfo` のネストを解消し、`productName` を直接参照 */}
                       <div className="font-medium text-blue-700">{match.productName || 'Unknown'}</div>
                     </td>
                     <td className="p-2 text-center">
                       <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">{match.quantity}個</span>
                     </td>
                     <td className="p-2 text-center">
                       <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                         match.matchType === 'exact' ? 'bg-green-100 text-green-800' :
                         match.matchType === 'high' ? 'bg-blue-100 text-blue-800' :
                         'bg-yellow-100 text-yellow-800'
                       }`}>{match.matchType}</span>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
            </div>

            <div className="flex gap-2">
               <Button variant="outline" onClick={() => setStep(1)} className="flex-1"><ArrowLeft className="h-4 w-4 mr-2" />戻る</Button>
               {parseResult.unmatchedProducts.length > 0 ? (
                 <Button onClick={handleStartUnmatchFix} className="flex-1"><ArrowRight className="h-4 w-4 mr-2" />未マッチ商品を修正</Button>
               ) : (
                 <Button onClick={handleConfirm} disabled={isLoading} className="flex-1">{isLoading ? '処理中...' : 'インポート実行'}</Button>
               )}
            </div>
           </>
         )}

         {step === 3 && currentUnmatch && (
           <>
             <div className="space-y-2 mb-4">
               <div className="flex justify-between text-sm">
                 <span>未マッチ商品修正</span>
                 <span>{currentUnmatchIndex + 1} / {parseResult.unmatchedProducts.length}</span>
               </div>
               <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-blue-600 h-2 rounded-full" style={{ width: `${progress}%` }}></div></div>
             </div>
             <Card className="border-orange-200 mb-4">
               <CardHeader className="pb-3"><CardTitle className="text-orange-700 flex items-center gap-2">🛍️ 楽天商品 <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">{currentUnmatch.quantity}個</span></CardTitle></CardHeader>
               <CardContent><div className="p-3 bg-orange-50 rounded-md font-medium text-orange-900">{currentUnmatch.rakutenTitle}</div></CardContent>
             </Card>
             <Card>
               <CardHeader><CardTitle>🎯 マッチする商品を選択</CardTitle></CardHeader>
               <CardContent>
                 <div className="space-y-3 max-h-72 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                   {products.map((product) => (
                     <button key={product.id} onClick={() => handleProductSelect(product.id)} className="w-full p-4 text-left border rounded-lg hover:bg-blue-50 transition-colors bg-white shadow-sm">
                       <div className="font-medium text-blue-900 mb-1">{product.name}</div>
                       <div className="text-sm text-gray-600">シリーズ: {product.series} | コード: {product.series_code}-{product.product_code}</div>
                     </button>
                   ))}
                 </div>
                 <div className="mt-4 pt-4 border-t">
                   <button onClick={() => handleProductSelect('skip')} className="w-full p-4 text-left border-2 border-dashed rounded-lg hover:bg-gray-50">
                     <div className="font-medium text-gray-600 flex items-center gap-2 justify-center"><X className="h-5 w-5" />この商品をスキップ</div>
                   </button>
                 </div>
               </CardContent>
             </Card>
             <div className="flex gap-2 mt-4">
               <Button variant="outline" onClick={() => setStep(2)} className="flex-1"><ArrowLeft className="h-4 w-4 mr-2" />確認画面に戻る</Button>
             </div>
           </>
         )}
       </div>
     </div>
   </div>
 );
}
