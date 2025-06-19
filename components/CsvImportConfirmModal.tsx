// /components/CsvImportConfirmModal.tsx ver.1
"use client";

type ImportResult = {
  id: number;
  original: string;
  matched: string | null;
};

interface CsvImportConfirmModalProps {
  isOpen: boolean;
  results: ImportResult[];
  onClose: () => void;
  onConfirm: () => void;
}

export default function CsvImportConfirmModal({
  isOpen,
  results,
  onClose,
  onConfirm,
}: CsvImportConfirmModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">CSVインポート内容の確認</h2>
          <p className="text-sm text-gray-600">
            AIによる商品名のマッチング結果です。内容を確認してください。（現在、表示のみ）
          </p>
        </div>
        <div className="p-4 flex-grow overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="p-2 w-1/2">CSVの商品名</th>
                <th className="p-2 w-1/2">マッチした商品（AI提案）</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id} className="border-b">
                  <td className="p-2">{result.original}</td>
                  <td className="p-2">
                    {result.matched ? (
                      <span className="text-green-700">{result.matched}</span>
                    ) : (
                      <span className="text-red-600">一致なし</span>
                    )}
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
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled // 本登録機能は未実装のため、まだ押せない
          >
            この内容でDBに登録（未実装）
          </button>
        </div>
      </div>
    </div>
  );
}
