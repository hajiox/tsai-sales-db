// /components/RakutenCsvImportModal.tsx ver.16 (修正UI実装版)
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Upload, AlertCircle, ArrowRight, ArrowLeft, FileText, AlertTriangle, Edit3, Check } from 'lucide-react';

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

interface Mapping {
  rakutenTitle: string;
  productId: string | null;
  quantity: number;
  isLearned?: boolean;
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
 const [allMappings, setAllMappings] = useState<Mapping[]>([]);
 const [learnedMappings, setLearnedMappings] = useState<Set<string>>(new Set());
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
     setAllMappings([]);
     setLearnedMappings(new Set());
     setError('');
   }
 }, [isOpen]);

 // parseResultが更新されたら、allMappingsを初期化
 useEffect(() => {
   if (parseResult) {
     const mappings: Mapping[] = [];
     
     // マッチ済み商品を追加
     if (parseResult.matchedProducts) {
       parseResult.matchedProducts.forEach((item: any) => {
         mappings.push({
           rakutenTitle: item.rakutenTitle,
           productId: item.productId,
           quantity: item.quantity,
           isLearned: true
         });
       });
     }
     
     // 未マッチ商品を追加
     if (parseResult.unmatchedProducts) {
       parseResult.unmatchedProducts.forEach((item: any) => {
         mappings.push({
           rakutenTitle: item.rakutenTitle,
           productId: null,
           quantity: item.quantity,
           isLearned: false
         });
       });
     }
     
     setAllMappings(mappings);
   }
 }, [parseResult]);

 if (!isOpen) return null;

 const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
   const file = e.target.files?.[0];
   if (file) {
     setCsvFile(file);
     setParseResult(null);
     setAllMappings([]);
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

 const handleStartFix = () => {
   setStep(3);
 };

 const handleMappingChange = (index: number, productId: string | null) => {
   setAllMappings(prev => {
     const newMappings = [...prev];
     newMappings[index] = {
       ...newMappings[index],
       productId: productId === 'skip' ? null : productId,
       isLearned: false
     };
     return newMappings;
   });
 };

 const handleLearnMapping = async (index: number) => {
   const mapping = allMappings[index];
   if (!mapping.productId || mapping.productId === 'skip') return;

   setIsLoading(true);
   try {
     const response = await fetch('/api/import/rakuten-learn', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({
         rakutenTitle: mapping.rakutenTitle,
         productId: mapping.productId
       }),
     });

     const result = await response.json();
     if (result.success) {
       setLearnedMappings(prev => new Set(prev).add(`${mapping.rakutenTitle}-${mapping.productId}`));
       setAllMappings(prev => {
         const newMappings = [...prev];
         newMappings[index] = { ...newMappings[index], isLearned: true };
         return newMappings;
       });
     }
   } catch (error) {
     console.error('学習エラー:', error);
   } finally {
     setIsLoading(false);
   }
 };

 const getStats = () => {
   const matched = allMappings.filter(m => m.productId !== null).length;
   const unmatched = allMappings.filter(m => m.productId === null).length;
   const totalQuantity = allMappings.reduce((sum, m) => sum + m.quantity, 0);
   const matchedQuantity = allMappings.filter(m => m.productId !== null).reduce((sum, m) => sum + m.quantity, 0);
   
   return { matched, unmatched, totalQuantity, matchedQuantity };
 };

 const handleConfirm = async () => {
   if (!parseResult) return;
   
   setIsLoading(true);
   setError('');

   try {
     // allMappingsから確定用データを生成
     const matchedProducts = allMappings
       .filter(m => m.productId !== null)
       .map(m => ({
         rakutenTitle: m.rakutenTitle,
         productId: m.productId,
         quantity: m.quantity
       }));

     const newMappings = allMappings
       .filter(m => m.productId !== null && !m.isLearned)
       .map(m => ({
         rakutenTitle: m.rakutenTitle,
         productId: m.productId!,
         quantity: m.quantity
       }));

     const requestData = {
       saleDate: `${saleMonth}-01`,
       matchedProducts: matchedProducts,
       newMappings: newMappings,
     };

     const response = await fetch('/api/import/rakuten-confirm', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
       },
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

 const stats = getStats();

 return (
   <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
     <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
       <div className="flex justify-between items-center p-6 border-b">
         <h2 className="text-xl font-bold">楽天CSV インポート</h2>
         <Button variant="ghost" size="sm" onClick={onClose}>
           <X className="h-4 w-4" />
         </Button>
       </div>

       <div className="p-6">
         {step === 1 && (
           <>
             <p className="text-gray-600 mb-4">
               楽天市場の商品別売上CSVをアップロードしてください。
             </p>

             {error && (
               <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                 <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                 <span className="text-red-600 text-sm">{error}</span>
               </div>
             )}

             <div className="mb-6">
               <label className="block text-sm font-medium mb-2">楽天CSV ファイル:</label>
               <div className="flex items-center gap-4 p-4 border-2 border-dashed rounded-lg">
                 <label htmlFor="rakuten-csv-upload" className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded-md border border-gray-300 transition-colors">
                   ファイルを選択
                 </label>
                 <Input
                   id="rakuten-csv-upload"
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
                 className="w-full mt-4"
               >
                 <Upload className="h-4 w-4 mr-2" />
                 {isLoading ? '解析中...' : '次へ（確認画面）'}
               </Button>
             </div>
           </>
         )}

         {step === 2 && parseResult && (
           <>
             {parseResult.summary.blankTitleInfo && parseResult.summary.blankTitleInfo.count > 0 && (
                <div className="mb-4 p-4 bg-orange-50 border-l-4 border-orange-400">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-orange-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-bold text-orange-700">
                        警告: 商品名が空欄の行が {parseResult.summary.blankTitleInfo.count} 件見つかりました
                      </p>
                      <p className="text-xs text-orange-600 mt-1">
                          合計 {parseResult.summary.blankTitleInfo.quantity} 個分が処理から除外されます。CSVを修正し再実行してください。
                      </p>
                    </div>
                  </div>
                </div>
              )}
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
                   <div className="text-2xl font-bold text-blue-600">
                     {parseResult.summary.totalProducts}件
                   </div>
                 </div>
                 <div className="text-center">
                   <div className="text-sm text-gray-600">総販売数量</div>
                   <div className="text-2xl font-bold text-blue-600">
                     {parseResult.summary.totalQuantity}個
                   </div>
                 </div>
                 <div className="text-center">
                   <div className="text-sm text-gray-600">処理可能数量</div>
                   <div className="text-2xl font-bold text-green-600">
                     {stats.matchedQuantity}個
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
                 onClick={handleStartFix}
                 variant="outline"
                 className="flex-1"
               >
                 <Edit3 className="h-4 w-4 mr-2" />
                 マッチング結果を修正
               </Button>

               <Button 
                 onClick={handleConfirm}
                 disabled={isLoading || stats.matched === 0}
                 className="flex-1"
               >
                 {isLoading ? '処理中...' : 'インポート実行'}
               </Button>
             </div>
           </>
         )}

         {step === 3 && (
           <>
             <div className="space-y-2 mb-4">
               <h3 className="text-lg font-semibold">マッチング結果の修正</h3>
               <p className="text-sm text-gray-600">
                 全{allMappings.length}件の商品マッピングを確認・修正できます
               </p>
             </div>

             <div className="grid grid-cols-3 gap-4 mb-4">
               <Card>
                 <CardContent className="pt-4">
                   <div className="text-sm text-gray-600">マッチ済み</div>
                   <div className="text-xl font-bold text-green-600">{stats.matched}件</div>
                 </CardContent>
               </Card>
               <Card>
                 <CardContent className="pt-4">
                   <div className="text-sm text-gray-600">未マッチ</div>
                   <div className="text-xl font-bold text-yellow-600">{stats.unmatched}件</div>
                 </CardContent>
               </Card>
               <Card>
                 <CardContent className="pt-4">
                   <div className="text-sm text-gray-600">処理可能数量</div>
                   <div className="text-xl font-bold text-blue-600">{stats.matchedQuantity}個</div>
                 </CardContent>
               </Card>
             </div>

             <div className="space-y-3 max-h-96 overflow-y-auto border rounded-lg p-3 bg-gray-50">
               {allMappings.map((mapping, index) => (
                 <div key={index} className="bg-white p-4 rounded-lg border border-gray-200">
                   <div className="grid grid-cols-12 gap-4 items-start">
                     <div className="col-span-5">
                       <div className="text-xs text-gray-500 mb-1">楽天商品名</div>
                       <div className="text-sm font-medium" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                         {mapping.rakutenTitle}
                       </div>
                       <div className="text-xs text-gray-500 mt-1">数量: {mapping.quantity}個</div>
                     </div>
                     
                     <div className="col-span-1 flex items-center justify-center">
                       <ArrowRight className="h-4 w-4 text-gray-400" />
                     </div>
                     
                     <div className="col-span-6">
                       <div className="text-xs text-gray-500 mb-1">マスタ商品</div>
                       <select
                         value={mapping.productId || 'skip'}
                         onChange={(e) => handleMappingChange(index, e.target.value)}
                         className="w-full p-2 border border-gray-200 rounded-md text-sm"
                       >
                         <option value="skip">-- 未選択（この商品はスキップ） --</option>
                         {products.map((product) => (
                           <option key={product.id} value={product.id}>
                             {product.name} ({product.series})
                           </option>
                         ))}
                       </select>
                       
                       {mapping.productId && mapping.productId !== 'skip' && (
                         <button
                           onClick={() => handleLearnMapping(index)}
                           disabled={mapping.isLearned || isLoading}
                           className={`mt-2 text-xs px-3 py-1 rounded-full transition-colors ${
                             mapping.isLearned 
                               ? 'bg-green-100 text-green-700 cursor-default'
                               : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                           }`}
                         >
                           {mapping.isLearned ? (
                             <>
                               <Check className="h-3 w-3 inline mr-1" />
                               学習済み
                             </>
                           ) : (
                             '📝 この組み合わせを学習'
                           )}
                         </button>
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
                 className="flex-1"
               >
                 {isLoading ? '処理中...' : `${stats.matched}件をインポート`}
               </Button>
             </div>
           </>
         )}
       </div>
     </div>
   </div>
 );
}
