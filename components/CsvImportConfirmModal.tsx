// /components/CsvImportConfirmModal.tsx ver.2
"use client";

type ImportResult = {
  id: number;
  original: string;
  matched: string | null;
};

// productMasterの型を仮で定義（実際のDB構造に合わせてください）
type ProductMaster = {
  id: string; // or number
  name: string;
};

interface CsvImportConfirmModalProps {
  isOpen: boolean;
  results: ImportResult[];
  productMaster: ProductMaster[];
  onClose: () => void;
  onConfirm: (updatedResults: ImportResult[]) => void;
  onResultChange: (id: number, newMatchedValue: string) => void;
}

export default function CsvImportConfirmModal({
  isOpen,
  results,
  productMaster,
  onClose,
  onConfirm,
  onResultChange,
}: CsvImportConfirmModalProps) {
  if (!isOpen) {
    return null;
  }

  const handleConfirmClick = () => {
    // 変更された結果を親コンポーネントに渡す
    onConfirm(results);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">CSVインポート内容の確認</h2>
          <p className="text-sm text-gray-600">
            AIによる商品名のマッチング結果です。内容が異なる場合はドロップダウンで修正してください。
          </p>
        </div>
        <div className="p-4 flex-grow overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="p-2 w-1/2">CSVの商品名</th>
                <th className="p-2 w-1/2">マッチした商品（修正可能）</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 align-middle">{result.original}</td>
                  <td className="p-2">
                    {/* [MODIFIED] 表示テキストをselect要素に変更 */}
                    <select
                      value={result.matched || ""}
                      onChange={(e) => onResultChange(result.id, e.target.value)}
                      className={`w-full p-1 border rounded text-sm ${
                        result.matched ? 'border-gray-300' : 'border-red-500 bg-red-50'
                      }`}
                    >
                      <option value="">-- 商品を選択 --</option>
                      {productMaster.map((product) => (
                        <option key={product.id} value={product.name}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirmClick}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled // DB登録機能は次のステップで実装
          >
            この内容でDBに登録（未実装）
          </button>
        </div>
      </div>
    </div>
  );
}
