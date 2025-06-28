// /components/AmazonCsvImportModal.tsx ver.9 (データ受け取り版)
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

interface AmazonCsvImportModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSuccess: () => void;
 products: Product[]; // ★ 親から商品マスターを受け取る
}

export default function AmazonCsvImportModal({ 
 isOpen, 
 onClose, 
 onSuccess,
 products // ★ Propsから受け取る
}: AmazonCsvImportModalProps) {
 const [step, setStep] = useState(1);
 const [csvFile, setCsvFile] = useState<File | null>(null);
 const [parseResult, setParseResult] = useState<any>(null);
 // ★ 内部での商品データ取得ロジック (useStateとuseEffect) を完全に削除
 const [newMappings, setNewMappings] = useState<Array<{amazonTitle: string; productId: string; quantity: number}>>([]);
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

     if (!response.ok) {
       throw new Error(result.error || 'Amazon CSVの解析に失敗しました');
     }
     
     setParseResult({
        matchedProducts: result.matchedResults,
        unmatchedProducts: result.unmatchedProducts,
        totalRows: result.summary.totalRows,
        csvTotalQuantity: result.summary.csvTotalQuantity,
        matchedQuantity: result.summary.matchedQuantity,
        blankTitleInfo: result.summary.blankTitleInfo,
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
     const mapping = {
       amazonTitle: currentUnmatch.amazonTitle,
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

     const response = await fetch('/api/import/amazon-confirm', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(requestData),
     });

     const result = await response.json();
     if (!result.success) throw new Error(result.error || '確定に失敗しました');
     
     alert(`Amazonデータが登録されました (登録件数: ${result.totalCount}件)`);
     onSuccess(); // 親に成功を通知
   } catch (error) {
     console.error('Amazon CSV確定エラー:', error);
     setError(error instanceof Error ? error.message : '確定処理中にエラーが発生しました');
     setStep(2);
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
          <h2 className="text-xl font-bold">Amazon CSV インポート</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-6">
          {step === 1 && (
            // ... ステップ1のJSXは変更なし
            <></>
          )}

          {step === 2 && parseResult && (
            <>
              {parseResult.blankTitleInfo && parseResult.blankTitleInfo.count > 0 && (
                <div className="mb-4 p-4 bg-orange-50 border-l-4 border-orange-400">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-orange-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-bold text-orange-700">
                        警告: 商品名が空欄の行が {parseResult.blankTitleInfo.count} 件見つかりました
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {/* ... ステップ2の残りのJSXは変更なし ... */}
            </>
          )}

          {step === 3 && currentUnmatch && (
            // ... ステップ3のJSXは変更なし
            <></>
          )}
        </div>
      </div>
    </div>
  );
}
