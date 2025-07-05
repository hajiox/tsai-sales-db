// /components/AmazonCsvImportModal.tsx ver.15 (マッチング修正UI全面改修版)
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

interface MatchedProduct {
  amazonTitle: string;
  productId: string;
  productName: string;
  quantity: number;
}

interface AmazonCsvImportModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSuccess: () => void;
 products: Product[];
}

export default function AmazonCsvImportModal({ 
 isOpen, 
 onClose, 
 onSuccess,
 products
}: AmazonCsvImportModalProps) {
 const [step, setStep] = useState(1);
 const [csvFile, setCsvFile] = useState<File | null>(null);
 const [parseResult, setParseResult] = useState<any>(null);
 const [newMappings, setNewMappings] = useState<Array<{amazonTitle: string; productId: string; quantity: number}>>([]);
 const [currentUnmatchIndex, setCurrentUnmatchIndex] = useState(0);
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string>('');
 const [duplicateWarning, setDuplicateWarning] = useState<string>('');
 const [saleMonth, setSaleMonth] = useState<string>(() => {
   const now = new Date();
   return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
 });
 
 // マッチング修正用の状態
 const [allMappings, setAllMappings] = useState<Array<{
   amazonTitle: string;
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
     setSavingMapping(null);
   }
 }, [isOpen]);

 useEffect(() => {
   if (parseResult && step === 4) {
     // Step 4に移行時、全マッピングを統合
     const matched = parseResult.matchedProducts || [];
     const unmatched = parseResult.unmatchedProducts || [];
     
     const mappings = [
       ...matched.map((m: MatchedProduct) => ({ ...m, isLearned: false })),
       ...unmatched.map((u: any) => ({
         amazonTitle: u.amazonTitle,
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
        setAllMappings([]);
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

     const response = await fetch('/api/import/amazon-parse', {
       method: 'POST',
       body: formData,
     });

     const result = await response.json();

     if (!response.ok || !result.ok) {
       throw new Error(result.error || 'Amazon CSVの解析に失敗しました');
     }
     
     setParseResult({
        matchedProducts: result.matched?.map((item: any) => ({
          amazonTitle: item.amazonTitle,
          productId: item.productId,
          productName: item.productName,
          quantity: item.qty
        })) || [],
        unmatchedProducts: result.unmatched?.map((item: any) => ({
          amazonTitle: item.amazonTitle,
          quantity: item.qty
        })) || [],
        summary: {
          ...result.summary,
          csvTotalQuantity: result.summary.csvTotalQty,
          matchedQuantity: result.summary.matchedQty,
          blankTitleInfo: result.summary.blankTitleInfo,
          duplicateMatches: result.summary.duplicateMatches
        }
     });

     setStep(2);
   } catch (error) {
     console.error('Amazon CSV解析エラー:', error);
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
     const product = products.find(p => p.id === productId);
     const mapping = {
       amazonTitle: currentUnmatch.amazonTitle,
       productId: productId,
       productName: product?.name || '',
       quantity: currentUnmatch.quantity
     };
     setNewMappings(prev => [...prev, mapping]);
   }

   setDuplicateWarning('');

   if (currentUnmatchIndex < parseResult.unmatchedProducts.length - 1) {
     setCurrentUnmatchIndex(currentUnmatchIndex + 1);
   } else {
     // 未マッチ修正完了後、修正画面へ
     setStep(4);
   }
 };

 // マッピング修正画面へ
 const handleStartEditMappings = () => {
   setStep(4);
 };

 // 個別学習機能
 const handleLearnMapping = async (index: number) => {
   const mapping = allMappings[index];
   if (!mapping.productId || mapping.isLearned) return;

   setSavingMapping(mapping.amazonTitle);
   
   try {
     const response = await fetch('/api/import/amazon-learn', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         amazonTitle: mapping.amazonTitle,
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

 // マッピング変更
 const handleMappingChange = (index: number, productId: string) => {
   const product = products.find(p => p.id === productId);
   setAllMappings(prev => prev.map((m, i) => 
     i === index ? { 
       ...m, 
       productId, 
       productName: product?.name || '',
       isLearned: false 
     } : m
   ));
 };

 const handleConfirm = async () => {
   setIsLoading(true);
   setError('');
   try {
     // 有効なマッピングのみ抽出
     const validMappings = allMappings.filter(m => m.productId);
     
     const requestData = {
       saleDate: `${saleMonth}-01`,
       matchedProducts: validMappings,
       newMappings: [], // 全て matchedProducts に統合
     };

     const response = await fetch('/api/import/amazon-confirm', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(requestData),
     });

     const result = await response.json();
     if (!result.success) {
       throw new Error(result.error || '確定処理に失敗しました');
     }

     alert(`Amazon CSVデータが正常に登録されました\n登録件数: ${result.totalCount}件`);
     onSuccess();
   } catch (error) {
     console.error('Amazon CSV確定エラー:', error);
     setError(error instanceof Error ? error.message : '確定処理中にエラーが発生しました');
   } finally {
     setIsLoading(false);
   }
 };

 const currentUnmatch = parseResult?.unmatchedProducts?.[currentUnmatchIndex];
 const progress = parseResult?.unmatchedProducts?.length > 0 
   ? ((currentUnmatchIndex + 1) / parseResult.unmatchedProducts.length) * 100 
   : 0;

 // 未マッチ件数の正確な計算
 const unmatchedCount = step === 4 
   ? allMappings.filter(m => !m.productId).length
   : (parseResult?.unmatchedProducts?.length || 0) - newMappings.length;

 return (
   <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
     <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
       <div className="flex justify-between items-center p-6 border-b">
         <h2 className="text-xl font-bold">Amazon CSV インポート</h2>
         <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
       </div>

       <div className="p-6">
         {step === 1 && (
           <>
             <p className="text-gray-600 mb-4">Amazonの注文レポートCSVをアップロードしてください。</p>
             {error && (
               <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                 <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                 <span className="text-red-600 text-sm">{error}</span>
               </div>
             )}
             <div className="mb-6">
               <label className="block text-sm font-medium mb-2">Amazon CSV ファイル:</label>
               <div className="flex items-center gap-4 p-4 border-2 border-dashed rounded-lg">
                 <label htmlFor="amazon-csv-upload" className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded-md border border-gray-300 transition-colors">ファイルを選択</label>
                 <Input id="amazon-csv-upload" type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                 <div className="flex items-center gap-2 text-gray-600">
                   <FileText className="h-5 w-5 text-gray-400" />
                   <span>{csvFile ? csvFile.name : '選択されていません'}</span>
                 </div>
               </div>
               <Button onClick={handleParse} disabled={!csvFile || isLoading} className="w-full mt-4">
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
               <input type="month" value={saleMonth} onChange={(e) => setSaleMonth(e.target.value)} className="border rounded-md p-2 w-full" />
             </div>
             <Card>
               <CardHeader><CardTitle className="flex items-center gap-2">📊 数量チェック</CardTitle></CardHeader>
               <CardContent className="grid grid-cols-3 gap-4">
                 <div className="text-center">
                   <div className="text-sm text-gray-600">CSV総行数</div>
                   <div className="text-2xl font-bold text-blue-600">{parseResult.summary.totalRows}件</div>
                 </div>
                 <div className="text-center">
                   <div className="text-sm text-gray-600">CSV総販売数量</div>
                   <div className="text-2xl font-bold text-blue-600">{parseResult.summary.csvTotalQuantity}個</div>
                 </div>
                 <div className="text-center">
                   <div className="text-sm text-gray-600">登録可能数量</div>
                   <div className="text-2xl font-bold text-green-600">{parseResult.summary.matchedQuantity}個</div>
                 </div>
               </CardContent>
             </Card>
             
             <div className="grid grid-cols-2 gap-4 my-4">
               <Card className="bg-green-50">
                 <CardHeader><CardTitle className="text-green-700">マッチ済み</CardTitle></CardHeader>
                 <CardContent><div className="text-2xl font-bold text-green-600">{parseResult.matchedProducts?.length || 0}件</div></CardContent>
               </Card>
               <Card className="bg-yellow-50">
                 <CardHeader><CardTitle className="text-yellow-700">未マッチ</CardTitle></CardHeader>
                 <CardContent><div className="text-2xl font-bold text-yellow-600">{unmatchedCount}件</div></CardContent>
               </Card>
             </div>
             
             <div className="flex gap-2">
               <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                 <ArrowLeft className="h-4 w-4 mr-2" />戻る
               </Button>
               <Button onClick={handleStartEditMappings} variant="secondary" className="flex-1">
                 <Edit2 className="h-4 w-4 mr-2" />マッチング結果を修正
               </Button>
               {unmatchedCount > 0 && (
                 <Button onClick={handleStartUnmatchFix} className="flex-1">
                   <ArrowRight className="h-4 w-4 mr-2" />未マッチ商品を修正
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
                 <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
               </div>
             </div>
             <Card className="border-orange-200 mb-4">
               <CardHeader className="pb-3">
                 <CardTitle className="text-orange-700 flex items-center gap-2">
                   🛍️ Amazon商品 
                   <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">{currentUnmatch.quantity}個</span>
                 </CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="p-3 bg-orange-50 rounded-md font-medium text-orange-900 break-words">
                   {currentUnmatch.amazonTitle}
                 </div>
               </CardContent>
             </Card>
             <Card className="mb-4">
               <CardHeader>
                 <CardTitle>🎯 マッチする商品を選択してください</CardTitle>
                 <p className="text-sm text-gray-600">{products?.length || 0}件の商品から選択するか、該当なしの場合はスキップしてください。</p>
               </CardHeader>
               <CardContent>
                 <div className="space-y-3 max-h-72 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                   {products && products.length > 0 ? (
                     products.map((product) => (
                       <button key={product.id} onClick={() => handleProductSelect(product.id)} className="w-full p-4 text-left border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors bg-white shadow-sm">
                         <div className="font-medium text-blue-900 mb-1 break-words">{product.name}</div>
                         <div className="text-sm text-gray-600">シリーズ: {product.series} | コード: {product.series_code}-{product.product_code}</div>
                       </button>
                     ))
                   ) : (
                     <div className="text-center py-8 text-gray-500">商品データが見つかりません。</div>
                   )}
                 </div>
                 <div className="mt-4 pt-4 border-t">
                   <button onClick={() => handleProductSelect('skip')} className="w-full p-4 text-left border-2 border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                     <div className="font-medium text-gray-600 flex items-center gap-2 justify-center"><X className="h-5 w-5" />この商品をスキップ</div>
                     <div className="text-sm text-gray-500 text-center mt-1">スキップした商品は売上データに登録されません</div>
                   </button>
                 </div>
               </CardContent>
             </Card>
             <div className="flex gap-2">
               <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                 <ArrowLeft className="h-4 w-4 mr-2" />確認画面に戻る
               </Button>
             </div>
           </>
         )}

         {step === 4 && (
           <>
             <h3 className="text-lg font-bold mb-4">マッチング結果の修正</h3>
             <Card>
               <CardHeader>
                 <CardTitle>📋 全商品マッピング一覧</CardTitle>
                 <p className="text-sm text-gray-600">
                   合計: {allMappings.length}件 / 
                   マッチ済み: {allMappings.filter(m => m.productId).length}件 / 
                   未マッチ: {allMappings.filter(m => !m.productId).length}件
                 </p>
               </CardHeader>
               <CardContent>
                 <div className="space-y-3 max-h-96 overflow-y-auto">
                   {allMappings.map((mapping, index) => (
                     <div key={index} className={`p-4 border rounded-lg ${mapping.productId ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                       <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                         <div>
                           <label className="text-sm font-medium text-gray-700">Amazon商品名</label>
                           <div className="mt-1 p-2 bg-white rounded border text-sm break-words">
                             {mapping.amazonTitle}
                           </div>
                           <div className="text-xs text-gray-500 mt-1">数量: {mapping.quantity}個</div>
                         </div>
                         <div>
                           <label className="text-sm font-medium text-gray-700">マスタ商品</label>
                           <select
                             value={mapping.productId}
                             onChange={(e) => handleMappingChange(index, e.target.value)}
                             className="mt-1 w-full p-2 border rounded text-sm"
                           >
                             <option value="">-- 商品を選択 --</option>
                             {products.map(p => (
                               <option key={p.id} value={p.id}>{p.name}</option>
                             ))}
                           </select>
                           {mapping.productId && (
                             <div className="mt-2 flex items-center gap-2">
                               <Button
                                 size="sm"
                                 variant={mapping.isLearned ? "secondary" : "default"}
                                 disabled={mapping.isLearned || savingMapping === mapping.amazonTitle}
                                 onClick={() => handleLearnMapping(index)}
                               >
                                 {savingMapping === mapping.amazonTitle ? (
                                   <>学習中...</>
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
                             </div>
                           )}
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               </CardContent>
             </Card>
             
             {error && (
               <div className="my-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                 <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                 <span className="text-red-600 text-sm">{error}</span>
               </div>
             )}
             
             <div className="flex gap-2 mt-4">
               <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                 <ArrowLeft className="h-4 w-4 mr-2" />確認画面に戻る
               </Button>
               <Button 
                 onClick={handleConfirm} 
                 disabled={isLoading || allMappings.filter(m => m.productId).length === 0} 
                 className="flex-1"
               >
                 {isLoading ? '処理中...' : `インポート実行（${allMappings.filter(m => m.productId).length}件）`}
               </Button>
             </div>
           </>
         )}
       </div>
     </div>
   </div>
 );
}
