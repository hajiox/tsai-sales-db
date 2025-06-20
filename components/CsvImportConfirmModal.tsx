// /components/CsvImportConfirmModal.tsx ver.4
"use client";

type ImportResult = {
  id: number;
  original: string;
  matched: string | null;
  salesData: { [key: string]: number };
};

type ProductMaster = {
  id: string;
  name: string;
};

interface CsvImportConfirmModalProps {
  isOpen: boolean;
  results: ImportResult[];
  productMaster: ProductMaster[];
  isSubmitting: boolean; // [ADD] 登録処理中フラグ
  onClose: () => void;
  onConfirm: (updatedResults: ImportResult[]) => void;
  onResultChange: (id: number, newMatchedValue: string) => void;
}

const dbToDisplayName: { [key: string]: string } = { 'amazon_count': 'Amazon', 'rakuten_count': '楽天', 'yahoo_count': 'Yahoo', 'mercari_count': 'メルカリ', 'base_count': 'BASE', 'qoo10_count': 'Qoo10' };
const displayOrder = ['amazon_count', 'rakuten_count', 'yahoo_count', 'mercari_count', 'base_count', 'qoo10_count'];

export default function CsvImportConfirmModal({
  isOpen,
  results,
  productMaster,
  isSubmitting,
  onClose,
  onConfirm,
  onResultChange,
}: CsvImportConfirmModalProps) {
  if (!isOpen) {
    return null;
  }

  const handleConfirmClick = () => {
    onConfirm(results);
  };

  const hasUnmatchedItems = results.some(r => !r.matched);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[80vh] flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">CSVインポート内容の確認</h2>
          <p className="text-sm text-gray-600">
            AIによる商品名のマッチング結果です。内容が異なる場合はドロップダウンで修正してください。
          </p>
        </div>
        <div className="p-4 flex-grow overflow-y-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="p-2 w-2/5">CSVの商品名</th>
                <th className="p-2 w-2/5">マッチした商品（修正可能）</th>
                {displayOrder.map(key => (<th key={key} className="p-2 text-center">{dbToDisplayName[key]}</th>))}
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 align-middle">{result.original}</td>
                  <td className="p-2">
                    <select
                      value={result.matched || ""}
                      onChange={(e) => onResultChange(result.id, e.target.value)}
                      className={`w-full p-1 border rounded text-sm ${result.matched ? 'border-gray-300' : 'border-red-500 bg-red-50'}`}
                    >
                      <option value="">-- 商品を選択 --</option>
                      {productMaster.map((product) => (
                        <option key={product.id} value={product.name}>{product.name}</option>
                      ))}
                    </select>
                  </td>
                  {displayOrder.map(key => (<td key={key} className="p-2 text-center">{result.salesData[key] || 0}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 items-center">
          {hasUnmatchedItems && <p className="text-sm text-red-600 mr-auto">未選択の商品があります。登録から除外されます。</p>}
          <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400" disabled={isSubmitting}>
            キャンセル
          </button>
          <button
            onClick={handleConfirmClick}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            disabled={isSubmitting} // [MODIFIED] disabledの条件を変更
          >
            {isSubmitting ? '登録中...' : 'この内容でDBに登録'}
          </button>
        </div>
      </div>
    </div>
  );
}
