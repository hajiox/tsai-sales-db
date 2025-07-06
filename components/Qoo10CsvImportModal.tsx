// /components/Qoo10CsvImportModal.tsx
// ver.2 (修正UI実装版 - Qoo10対応)

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Upload, AlertCircle, ArrowRight, ArrowLeft, FileText, AlertTriangle, Edit2, Check, Save } from 'lucide-react';

interface Product {
 id: string;
 name: string;
 series: string;
 series_code: number;
 product_code: number;
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
 const [newMappings, setNewMappings] = useState<Array<{qoo10Title: string; productId: string; quantity: number}>>([]);
 const [currentUnmatchIndex, setCurrentUnmatchIndex] = useState(0);
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string>('');
 const [saleMonth, setSaleMonth] = useState<string>(() => {
   const now = new Date();
   return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
 });

 // 修正UI用の状態
 const [allMappings, setAllMappings] = useState<Array<{
   qoo10Title: string;
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
     setNewMappings([]);
     setCurrentUnmatchIndex(0);
     setError('');
     setAllMappings([]);
   }
 }, [isOpen]);

 // parseResultからallMappingsへの変換
 useEffect(() => {
   if (parseResult && step === 3) {
     const matched = parseResult.matchedProducts || [];
     const unmatched = parseResult.unmatchedProducts || [];
     
     const mappings = [
       ...matched.map((m: any) => ({
         qoo10Title: m.qoo10Title,
         productId: m.productInfo.id,
         productName: m.productInfo.name,
         quantity: m.quantity,
         isLearned: false
       })),
       ...unmatched.map((u: any) => ({
         qoo10Title: u.qoo10Title,
         productId: '',
         productName: '',
         quantity: u.quantity,
         isLearned: false
       }))
     ];
     
     setAllMappings(mappings);
   }
 }, [parseResult, step]);

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
     
     const response = await fetch('/api/import/qoo10-parse', {
       method: 'POST',
       body: formData,
     });

     const result = await response.json();

     if (!result.success) {
       throw new Error(result.error || 'Qoo10 CSVの解析に失敗しました');
     }

     setParseResult(result);
     setStep(2);
   } catch (error) {
     console.error('Qoo10 CSV解析エラー:', error);
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
       qoo10Title: currentUnmatch.qoo10Title,
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

 // 修正UI: マッピング変更ハンドラ
 const handleMappingChange = (index: number, newProductId: string) => {
   setAllMappings(prev => prev.map((mapping, i) => {
     if (i === index) {
       const product = products.find(p => p.id === newProductId);
       return {
         ...mapping,
         productId: newProductId,
         productName: product?.name || '',
         isLearned: false
       };
     }
     return mapping;
   }));
 };

 // 修正UI: 個別学習機能
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
     if (result.success) {
       setAllMappings(prev => prev.map((m, i) => 
         i === index ? { ...m, isLearned: true } : m
       ));
     } else {
       throw new Error(result.error || '学習に失敗しました');
     }
   } catch (error) {
     console.error('学習エラー:', error);
     alert('学習に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'));
   } finally {
     setSavingMapping(null);
   }
 };

 // 統計情報の計算
 const getStats = () => {
   if (step === 3 && allMappings.length > 0) {
     const matched = allMappings.filter(m => m.productId).length;
     const unmatched = allMappings.filter(m => !m.productId).length;
     const totalQuantity = allMappings.filter(m => m.productId)
       .reduce((sum, m) => sum + m.quantity, 0);
     return { matched, unmatched, totalQuantity };
   }
   else if (parseResult) {
     const matched = parseResult.matchedProducts?.length || 0;
     const unmatched = parseResult.unmatchedProducts?.length || 0;
     const totalQuantity = parseResult.summary.processableQuantity || 0;
     return { matched, unmatched, totalQuantity };
   }
   return { matched: 0, unmatched: 0, totalQuantity: 0 };
 };

 const handleConfirm = async () => {
   if (!parseResult) return;
   
   setIsLoading(true);
   setError('');

   try {
     // Step 3の場合は修正されたデータを使用
     const matchedProducts = step === 3 
       ? allMappings.filter(m => m.productId).map(m => ({
           qoo10Title: m.qoo10Title,
           productInfo: { id: m.productId },
           quantity: m.quantity
         }))
       : parseResult.matchedProducts.map((item: any) => ({
           qoo10Title: item.qoo10Title,
           productInfo: { id: item.productInfo.id },
           quantity: item.quantity
         }));

     const requestData = {
       saleDate: `${saleMonth}-01`,
       matchedProducts,
       newMappings: step === 3 ? [] : newMappings,
     };

     const response = await fetch('/api/import/qoo10-confirm', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
       },
       body: JSON.stringify(requestData),
     });

     const result = await response.json();
     if (!result.success) {
       throw new Error(result.error || 'Qoo10 CSVの確定に失敗しました');
     }

     alert(`Qoo10 CSVデータが正常に登録されました\n登録件数: ${result.totalCount}件`);
     onSuccess();
   } catch (error) {
     console.error('Qoo10 CSV確定エラー:', error);
     setError(error instanceof Error ? error.message : '確定処理中にエラーが発生しました');
   } finally {
     setIsLoading(false);
   }
 };

 const currentUnmatch = parseResult?.unmatchedProducts?.[currentUnmatchIndex];
 const qoo10Core = currentUnmatch?.qoo10Title?.substring(0, 40).trim();
 const progress = parseResult?.unmatchedProducts?.length > 0 
   ? ((currentUnmatchIndex + 1) / parseResult.unmatchedProducts.length) * 100 
   : 0;

 const stats = getStats();

 return (
   <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
     <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
       <div className="flex justify-between items-center p-6 border-b">
         <h2 className="text-xl font-bold">🟣 Qoo10 CSV インポート</h2>
         <Button variant="ghost" size="sm" onClick={onClose}>
           <X className="h-4 w-4" />
         </Button>
       </div>

       <div className="p-6">
         {step === 1 && (
           <>
             <p className="text-gray-600 mb-4">
               Qoo10の売上CSVをアップロードしてください。
             </p>

             {error && (
               <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                 <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                 <span className="text-red-600 text-sm">{error}</span>
               </div>
             )}

             <div className="mb-6">
               <label className="block text-sm font-medium mb-2">Qoo10 CSV ファイル:</label>
               <div className="flex items-center gap-4 p-4 border-2 border-dashed rounded-lg">
                 <label htmlFor="qoo10-csv-upload" className="cursor-pointer bg-pink-100 hover:bg-pink-200 text-pink-800 font-medium py-2 px-4 rounded-md border border-pink-300 transition-colors">
                   ファイルを選択
                 </label>
                 <Input
                   id="qoo10-csv-upload"
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
                 className="w-full mt-4 bg-pink-600 hover:bg-pink-700"
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
                   <div className="text-2xl font-bold text-pink-600">
                     {parseResult.summary.totalProducts}件
                   </div>
                 </div>
                 <div className="text-center">
                   <div className="text-sm text-gray-600">総販売数量</div>
                   <div className="text-2xl font-bold text-pink-600">
                     {parseResult.summary.totalQuantity}個
                   </div>
                 </div>
                 <div className="text-center">
                   <div className="text-sm text-gray-600">処理可能数量</div>
                   <div className="text-2xl font-bold text-pink-600">
                     {stats.totalQuantity}個
                   </div>
                 </div>
               </CardContent>
             </Card>

             <div className="grid grid-cols-2 gap-4 my-4">
               <Card className="bg-pink-50">
                 <CardHeader>
                   <CardTitle className="text-pink-700">マッチ済み</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold text-pink-600">
                     {stats.matched}件
                   </div>
                 </CardContent>
               </Card>

               <Card className="bg-yellow-50">
                 <CardHeader>
                   <CardTitle className="text-yellow-700">未マッチ</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <div className="text-2xl font-bold text-yellow-600">
                     {stats.unmatched}件
                   </div>
                 </CardContent>
               </Card>
             </div>

             <div className="flex gap-2">
               <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                 <ArrowLeft className="h-4 w-4 mr-2" />
                 戻る
               </Button>
               
               <Button 
                 onClick={() => setStep(3)}
                 className="flex-1 bg-purple-600 hover:bg-purple-700"
               >
                 <Edit2 className="h-4 w-4 mr-2" />
                 マッチング結果を修正
               </Button>
               
               <Button 
                 onClick={handleConfirm}
                 disabled={isLoading || stats.matched === 0}
                 className="flex-1 bg-pink-600 hover:bg-pink-700"
               >
                 {isLoading ? '処理中...' : 'インポート実行'}
               </Button>
             </div>
           </>
         )}

         {step === 3 && (
           <>
             <div className="mb-4">
               <div className="flex justify-between items-center">
                 <h3 className="text-lg font-semibold">マッチング結果の修正</h3>
                 <div className="text-sm text-gray-600">
                   マッチ済み: {stats.matched}件 / 未マッチ: {stats.unmatched}件
                 </div>
               </div>
             </div>

             <div className="space-y-3 max-h-[60vh] overflow-y-auto border rounded-lg p-4">
               {allMappings.map((mapping, index) => (
                 <div 
                   key={index} 
                   className={`p-4 rounded-lg border ${
                     mapping.productId 
                       ? 'bg-pink-50 border-pink-200' 
                       : 'bg-yellow-50 border-yellow-200'
                   }`}
                 >
                   <div className="grid grid-cols-12 gap-4 items-center">
                     <div className="col-span-5">
                       <div className="text-sm text-gray-600 mb-1">Qoo10商品</div>
                       <div className="font-medium">{mapping.qoo10Title}</div>
                       <div className="text-sm text-gray-500">数量: {mapping.quantity}個</div>
                     </div>
                     
                     <div className="col-span-1 flex justify-center">
                       <ArrowRight className="h-5 w-5 text-gray-400" />
                     </div>
                     
                     <div className="col-span-4">
                       <select
                         value={mapping.productId}
                         onChange={(e) => handleMappingChange(index, e.target.value)}
                         className="w-full p-2 border rounded-md"
                       >
                         <option value="">-- 未選択（この商品はスキップ） --</option>
                         {products.map((product) => (
                           <option key={product.id} value={product.id}>
                             {product.name} ({product.series_code}-{product.product_code})
                           </option>
                         ))}
                       </select>
                     </div>
                     
                     <div className="col-span-2 text-right">
                       {mapping.productId && (
                         <Button
                           size="sm"
                           variant={mapping.isLearned ? "outline" : "default"}
                           onClick={() => handleLearnMapping(index)}
                           disabled={mapping.isLearned || savingMapping === mapping.qoo10Title}
                           className={mapping.isLearned ? "text-green-600" : ""}
                         >
                           {savingMapping === mapping.qoo10Title ? (
                             <>
                               <Save className="h-3 w-3 mr-1 animate-pulse" />
                               保存中...
                             </>
                           ) : mapping.isLearned ? (
                             <>
                               <Check className="h-3 w-3 mr-1" />
                               学習済み
                             </>
                           ) : (
                             <>
                               <Save className="h-3 w-3 mr-1" />
                               この組み合わせを学習
                             </>
                           )}
                         </Button>
                       )}
                     </div>
                   </div>
                 </div>
               ))}
             </div>

             <div className="flex gap-2 mt-4">
               <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                 <ArrowLeft className="h-4 w-4 mr-2" />
                 確認画面に戻る
               </Button>
               
               <Button 
                 onClick={handleConfirm}
                 disabled={isLoading || stats.matched === 0}
                 className="flex-1 bg-pink-600 hover:bg-pink-700"
               >
                 {isLoading ? '処理中...' : `${stats.matched}件をインポート実行`}
               </Button>
             </div>
           </>
         )}
       </div>
     </div>
   </div>
 );
}
