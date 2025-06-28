// /components/AmazonCsvImportModal.tsx ver.8 (空欄検知アラート対応版)
'use client';

import { useState, useEffect } from 'react';
//（変更前と同じ部分は省略）...
import { X, Upload, AlertCircle, ArrowRight, ArrowLeft, FileText, AlertTriangle } from 'lucide-react';

//（PropsとProductインターフェースは変更なし）...
interface AmazonCsvImportModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSuccess: () => void;
}
interface Product {
 id: string;
 name: string;
 series: string;
 series_code: number;
 product_code: number;
}


export default function AmazonCsvImportModal({ isOpen, onClose, onSuccess }: AmazonCsvImportModalProps) {
  //（useStateフックは変更なし）...
  const [step, setStep] = useState(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [newMappings, setNewMappings] = useState<Array<{amazonTitle: string; productId: string; quantity: number}>>([]);
  const [currentUnmatchIndex, setCurrentUnmatchIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [saleMonth, setSaleMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  //（useEffectフックも変更なし）...
  useEffect(() => {
   if (isOpen) {
     const fetchProducts = async () => {
       try {
         const { createClient } = await import('@supabase/supabase-js');
         const supabase = createClient(
           process.env.NEXT_PUBLIC_SUPABASE_URL!,
           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
         );
         const { data, error } = await supabase
           .from('products')
           .select('id, name, series, series_code, product_code')
           .order('series_code', { ascending: true });
         if (error) throw error;
         setProducts(data || []);
       } catch (error) {
         console.error('商品データ取得エラー:', error);
         setProducts([]);
       }
     };
     fetchProducts();
   }
 }, [isOpen]);

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
        blankTitleInfo: result.summary.blankTitleInfo, // ★ APIからの空欄情報を格納
      });

      setStep(2);
    } catch (error) {
      console.error('Amazon CSV解析エラー:', error);
      setError(error instanceof Error ? error.message : '不明なエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };
  
  //（以降の関数は変更なし）...
  const handleStartUnmatchFix = () => { setStep(3); setCurrentUnmatchIndex(0); };
  const handleProductSelect = (productId: string) => {
    // ...
  };
  const handleConfirm = async () => {
    // ...
  };

  // ...
  if (!isOpen) return null;


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        {/* ...ヘッダー部分は変更なし... */}

        <div className="p-6">
          {/* ステップ1は変更なし */}
          
          {/* ステップ2: 確認画面 */}
          {step === 2 && parseResult && (
            <>
              {/* ★ ここに警告表示を追加 */}
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
                      <div className="mt-2 text-sm text-orange-600">
                        <p>
                          合計 {parseResult.blankTitleInfo.quantity} 個分の売上が商品名不明のため、処理から除外されています。
                        </p>
                        <p className="mt-1">
                          これらはAmazon側の商品統廃合などが原因の可能性があります。CSVファイルを開き、該当行の削除や数量の付け替えを行った上で、再度インポートしてください。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ...以降の表示は変更なし... */}
              <div className="mb-4">
               <label className="block text-sm font-medium mb-2">売上月:</label>
               <input type="month" value={saleMonth} onChange={(e) => setSaleMonth(e.target.value)} className="border rounded-md p-2 w-full" />
              </div>
              <Card>
                {/* ... */}
              </Card>
            </>
          )}

          {/* ...ステップ3も変更なし... */}
        </div>
      </div>
    </div>
  );
}

// NOTE: 可読性のため、変更のないコードブロックは省略しています。
// 実際にはファイル全体を置き換えてください。
