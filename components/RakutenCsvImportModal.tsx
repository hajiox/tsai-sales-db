// /components/RakutenCsvImportModal.tsx ver.10 (空欄検知アラート対応版)
'use client';

// ...（インポートなどは同様に修正）
import { AlertTriangle } from 'lucide-react';

export default function RakutenCsvImportModal({ isOpen, onClose, onSuccess }: RakutenCsvImportModalProps) {
  // ...（useStateフックなどは変更なし）
  const [parseResult, setParseResult] = useState<any>(null);

  const handleParse = async () => {
    // ...（処理はほぼ同じ）
    try {
      // ...
      const result = await response.json();
      // ...
      setParseResult(result); // ★ APIのレスポンスにblankTitleInfoが含まれるのでそのままセット
      setStep(2);
    } catch (error) {
      // ...
    } finally {
      setIsLoading(false);
    }
  };

  // ...（その他の関数は変更なし）

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        {/* ...ヘッダー部分は変更なし... */}
        <div className="p-6">
          {/* ...ステップ1は変更なし... */}

          {/* ステップ2: 確認画面 */}
          {step === 2 && parseResult && (
            <>
              {/* ★ ここに警告表示を追加 (Amazonと全く同じコンポーネント) */}
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
                          CSVファイルを開き、該当行の削除や数量の付け替えを行った上で、再度インポートしてください。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ...以降の表示は変更なし... */}
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
