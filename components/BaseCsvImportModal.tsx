// /components/BaseCsvImportModal.tsx
// ver.1 (楽天完全移植版 - BASE対応)

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

interface BaseCsvImportModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSuccess: () => void;
 products: Product[];
}

export default function BaseCsvImportModal({ 
 isOpen, 
 onClose, 
 onSuccess,
 products
}: BaseCsvImportModalProps) {
 const [step, setStep] = useState(1);
 const [csvFile, setCsvFile] = useState<File | null>(null);
 const [parseResult, setParseResult] = useState<any>(null);
 const [newMappings, setNewMappings] = useState<Array<{baseTitle: string; productId: string; quantity: number}>>([]);
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
     setParseResult(null);
     setNewMappings([]);
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
     const formData = new FormData();
     formData.append('file', csvFile);
     
     const response = await fetch('/api/import/base-parse', {
       method: 'POST',
       body: formData,
     });

     const result = await response.json();

     if (!result.success) {
       throw new Error(result.error || 'BASE CSVの解析に失敗しました');
     }

     setParseResult(result);
     setStep(2);
   } catch (error) {
     console.error('BASE CSV解析エラー:', error);
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
       baseTitle: currentUnmatch.baseTitle,
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
       matchedProducts: parseResult.matchedProducts.map((item: any) => ({
         baseTitle: item.baseTitle,
         productInfo: {
           id: item.productInfo.id
         },
         quantity: item.quantity
       })),
       newMappings: newMappings,
     };

     const response = await fetch('/api/import/base-confirm', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
       },
       body: JSON.stringify(requestData),
     });

     const result = await response.json();
     if (!result.success) {
       throw new Error(result.error || 'BASE CSVの確定に失敗しました');
     }

     alert(`BASE CSVデータが正常に登録されました\n登録件数: ${result.totalCount}件`);
     onSuccess();
   } catch (error) {
     console.error('BASE CSV確定エラー:', error);
     setError(error instanceof Error ? error.message : '確定処理中にエラーが発生しました');
   } finally {
     setIsLoading(false);
   }
 };

 const currentUnmatch = parseResult?.unmatchedProducts?.[currentUnmatchIndex];
 const baseCore = currentUnmatch?.baseTitle?.substring(0, 40).trim();
 const progress = parseResult?.unmatchedProducts?.length > 0 
   ? ((currentUnmatchIndex + 1) / parseResult.unmatchedProducts.length) * 100 
   : 0;

 return (
   <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
     <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
       <div className="flex justify-between items-center p-6 border-b">
         <h2 className="text-xl font-bold">🏪 BASE CSV インポート</h2>
         <Button variant="ghost" size="sm" onClick={onClose}>
           <X className="h-4 w-4" />
         </Button>
       </div>

       <div className="p-6">
         {step === 1 && (
           <>
             <p className="text-gray-600 mb-4">
               BASEの売上CSVをアップロードしてください。
             </p>

             {error && (
               <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                 <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                 <span className="text-red-600 text-sm">{error}</span>
               </div>
             )}

             <div className="mb-6">
               <label className="block text-sm font-medium mb-2">BASE CSV ファイル:</label>
               <div className="flex items-center gap-4 p-4 border-2 border-dashed rounded-lg">
                 <label htmlFor="base-csv-upload" className="cursor-pointer bg-green-100 hover:bg-green-200 text-green-800 font-medium py-2 px-4 rounded-md border border-green-300 transition-colors">
                   ファイルを選択
                 </label>
                 <Input
                   id="base-csv-upload"
                   type="file"
                   accept=".csv"
                   onChange={handleFileChange}
                   className="hidden"
                 />
                 <div className="flex items-center gap-2 text-gray-600">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <span>{csvFile ? csvFile.name : '選択されていません'}</span>
                 </div>
               </div>
               
               <Button 
                 onClick={handleParse}
                 disabled={!csvFile || isLoading}
                 className="w-full mt-4 bg-green-600 hover:bg-green-700"
               >
                 <Upload className="h-4 w-4 mr-2" />
                 {isLoading ? '解析中...' : '次へ（確認画面）'}
               </Button>
             </div>
           </>
         )}

         {step === 2 && parseResult && (
           <>
             <div className="mb-4">
               <label className="block text-sm font-medium mb-2">売上月:</label>
               <input
                 type="month"
                 value={saleMonth}
                 onChange={(e) => setSaleMonth(e.target.value)}
                 className="border rounded-md p-2 w-full"
               />
             </div>

             <Card>
               <CardHeader>
                 <CardTitle className="flex items-center gap-2">
                   📊 数量チェック
                 </CardTitle>
               </CardHeader>
               <CardContent className="grid grid-cols-3 gap-4">
                 <div className="text-center">
                   <div className="text-sm text-gray-600">CSV総商品数</div>
                   <div className="text-2xl font-bold text-green-600">
                     {parseResult.summary.totalProducts}件
                   </div>
                 </div>
                 <div className="text-center">
                   <div className="text-sm text-gray-600">総販売数量</div>
                   <div className="text-2xl font-bold text-green-600">
                     {parseResult.summary.totalQuantity}個
                   </div>
                 </div>
                 <div className="text-center">
                   <div className="text-sm text-gray-600">処理可能数量</div>
                   <div className="text-2xl font-bold text-green-600">
                     {parseResult.summary.processableQuantity + newMappings.reduce((sum, m) => sum + m.quantity, 0)}個
                   </div>
                 </div>
               </CardContent>
             </Card>

             <div className="grid grid-cols-2 gap-4 my-4">
               <Card className="bg-green-50">
                 <CardHeader>
                   <CardTitle className="text-green-700">マッチ済み</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold text-green-600">
                     {(parseResult.matchedProducts?.length || 0) + newMappings.length}件
                   </div>
                 </CardContent>
               </Card>

               <Card className="bg-yellow-50">
                 <CardHeader>
                   <CardTitle className="text-yellow-700">未マッチ</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold text-yellow-600">
                     {(parseResult.unmatchedProducts?.length || 0) - newMappings.length}件
                   </div>
                 </CardContent>
               </Card>
             </div>

             <div className="flex gap-2">
               <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                 <ArrowLeft className="h-4 w-4 mr-2" />
                 戻る
               </Button>
               
               {(parseResult.unmatchedProducts?.length || 0) > newMappings.length ? (
                 <Button onClick={handleStartUnmatchFix} className="flex-1 bg-green-600 hover:bg-green-700">
                   <ArrowRight className="h-4 w-4 mr-2" />
                   未マッチ商品を修正
                 </Button>
               ) : (
                 <Button 
                   onClick={handleConfirm}
                   disabled={isLoading}
                   className="flex-1 bg-green-600 hover:bg-green-700"
                 >
                   {isLoading ? '処理中...' : 'インポート実行'}
                 </Button>
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
               <div className="w-full bg-gray-200 rounded-full h-2">
                 <div 
                   className="bg-green-600 h-2 rounded-full transition-all duration-300"
                   style={{ width: `${progress}%` }}
                 ></div>
               </div>
             </div>

             <Card className="border-green-200 mb-4">
               <CardHeader className="pb-3">
                 <CardTitle className="text-green-700 flex items-center gap-2">
                   🏪 BASE商品
                   <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">{currentUnmatch.quantity}個</span>
                 </CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="p-3 bg-green-50 rounded-md">
                   <div className="font-medium text-green-900">
                     {baseCore}
                   </div>
                 </div>
               </CardContent>
             </Card>

             <Card className="mb-4">
               <CardHeader>
                 <CardTitle>🎯 マッチする商品を選択してください</CardTitle>
                 <p className="text-sm text-gray-600">
                   {products?.length || 0}件の商品から選択するか、該当なしの場合はスキップしてください
                 </p>
               </CardHeader>
               <CardContent>
                 <div className="space-y-3 max-h-72 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                   {products && products.length > 0 ? (
                     products.map((product) => (
                       <button
                         key={product.id}
                         onClick={() => handleProductSelect(product.id)}
                         className="w-full p-4 text-left border border-gray-200 rounded-lg hover:bg-green-50 hover:border-green-300 transition-colors bg-white shadow-sm"
                       >
                         <div className="font-medium text-green-900 mb-1">
                           {product.name}
                         </div>
                         <div className="text-sm text-gray-600">
                           シリーズ: {product.series} | コード: {product.series_code}-{product.product_code}
                         </div>
                       </button>
                     ))
                   ) : (
                     <div className="text-center py-8 text-gray-500">
                       商品データが見つかりません
                     </div>
                   )}
                 </div>
                 
                 <div className="mt-4 pt-4 border-t">
                   <button
                     onClick={() => handleProductSelect('skip')}
                     className="w-full p-4 text-left border-2 border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                   >
                     <div className="font-medium text-gray-600 flex items-center gap-2 justify-center">
                       <X className="h-5 w-5" />
                       この商品をスキップ
                     </div>
                   </button>
                 </div>
               </CardContent>
             </Card>

             <div className="flex gap-2">
               <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                 <ArrowLeft className="h-4 w-4 mr-2" />
                 確認画面に戻る
               </Button>
             </div>
           </>
         )}
       </div>
     </div>
   </div>
 );
}
