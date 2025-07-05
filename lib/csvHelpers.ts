// /components/AmazonCsvImportModal.tsx ver.16 (UI統合・マッチング修正版)
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
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string>('');
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
     setError('');
     setAllMappings([]);
     setSavingMapping(null);
   }
 }, [isOpen]);

 useEffect(() => {
   if (parseResult && step === 3) {
     // Step 3に移行時、全マッピングを統合
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
       newMappings: [],
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

 // 統計情報の計算
 const getStats = () => {
   if (step === 3 && allMappings.length > 0) {
     const matched = allMappings.filter(m => m.productId).length;
     const unmatched = allMappings.filter(m => !m.productId).length;
     const totalQuantity = allMappings.filter(m => m.productId).reduce((sum, m) => sum + m.quantity, 0);
     return { matched, unmatched, totalQuantity };
   } else if (parseResult) {
     const matched = parseResult.matchedProducts?.length || 0;
     const unmatched = parseResult.unmatchedProducts?.length || 0;
     const totalQuantity = parseResult.summary.matchedQuantity || 0;
     return { matched, unmatched, totalQuantity };
   }
   return { matched: 0, unmatched: 0, totalQuantity: 0 };
 };

 const stats = getStats();

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
                   <div className="text-2xl font-bold text-green-600">{stats.totalQuantity}個</div>
                 </div>
               </CardContent>
             </Card>
             
             <div className="grid grid-cols-2 gap-4 my-4">
               <Card className="bg-green-50">
                 <CardHeader><CardTitle className="text-green-700">マッチ済み</CardTitle></CardHeader>
                 <CardContent><div className="text-2xl font-bold text-green-600">{stats.matched}件</div></CardContent>
               </Card>
               <Card className="bg-yellow-50">
                 <CardHeader><CardTitle className="text-yellow-700">未マッチ</CardTitle></CardHeader>
                 <CardContent><div className="text-2xl font-bold text-yellow-600">{stats.unmatched}件</div></CardContent>
               </Card>
             </div>
             
             <div className="flex gap-2">
               <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                 <ArrowLeft className="h-4 w-4 mr-2" />戻る
               </Button>
               <Button onClick={() => setStep(3)} className="flex-1">
                 <Edit2 className="h-4 w-4 mr-2" />マッチング結果を修正
               </Button>
             </div>
           </>
         )}

         {step === 3 && (
           <>
             <h3 className="text-lg font-bold mb-4">マッチング結果の修正</h3>
             <Card className="mb-4">
               <CardHeader>
                 <CardTitle>📊 現在の状況</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="grid grid-cols-3 gap-4 text-center">
                   <div>
                     <div className="text-sm text-gray-600">合計</div>
                     <div className="text-2xl font-bold">{allMappings.length}件</div>
                   </div>
                   <div>
                     <div className="text-sm text-gray-600">マッチ済み</div>
                     <div className="text-2xl font-bold text-green-600">{stats.matched}件</div>
                   </div>
                   <div>
                     <div className="text-sm text-gray-600">未マッチ</div>
                     <div className="text-2xl font-bold text-yellow-600">{stats.unmatched}件</div>
                   </div>
                 </div>
               </CardContent>
             </Card>
             
             <Card>
               <CardHeader>
                 <CardTitle>📋 商品マッピング一覧</CardTitle>
                 <p className="text-sm text-gray-600">
                   Amazon商品名とマスタ商品を紐付けてください。未マッチの商品は空欄のまま保存されません。
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
                             <option value="">-- 未選択（この商品はスキップ） --</option>
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
                 disabled={isLoading || stats.matched === 0} 
                 className="flex-1"
               >
                 {isLoading ? '処理中...' : `インポート実行（${stats.matched}件）`}
               </Button>
             </div>
           </>
         )}
       </div>
     </div>
   </div>
 );
}
