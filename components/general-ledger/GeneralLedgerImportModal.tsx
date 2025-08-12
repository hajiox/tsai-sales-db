// /components/general-ledger/GeneralLedgerImportModal.tsx ver.16
'use client';

import { useState } from 'react';
import { X, FileText, Upload, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface GeneralLedgerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export default function GeneralLedgerImportModal({
  isOpen,
  onClose,
  onImportComplete,
}: GeneralLedgerImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reportMonth, setReportMonth] = useState(
    format(new Date(), 'yyyy-MM')
  );
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // .txt または .csv ファイルを受け入れる
      if (file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError('CSVファイルまたはテキストファイルを選択してください');
        setSelectedFile(null);
      }
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !reportMonth) {
      setError('ファイルと対象月を選択してください');
      return;
    }

    setIsImporting(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('reportMonth', reportMonth);

      const response = await fetch('/api/general-ledger/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'インポートに失敗しました');
      }

      console.log('インポート成功:', result);
      setSuccess(true);
      
      // 成功時の処理
      setTimeout(() => {
        setSelectedFile(null);
        setSuccess(false);
        
        // onImportCompleteの呼び出しを安全に行う
        try {
          if (typeof onImportComplete === 'function') {
            onImportComplete();
          }
        } catch (callbackError) {
          console.error('コールバック実行エラー:', callbackError);
        }
        
        onClose();
      }, 2000);
    } catch (error) {
      console.error('インポートエラー:', error);
      setError(error instanceof Error ? error.message : 'インポートに失敗しました');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">総勘定元帳インポート</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={isImporting}
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              対象月
            </label>
            <input
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="w-full p-2 border rounded-md"
              lang="ja"
              disabled={isImporting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ファイル選択（CSV/TXT）
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="file-upload"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                  >
                    <span>ファイルを選択</span>
                    <input
                      id="file-upload"
                      name="file-upload"
                      type="file"
                      className="sr-only"
                      accept=".csv,.txt"
                      onChange={handleFileChange}
                      disabled={isImporting}
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  CSV または TXT ファイル
                </p>
                {selectedFile && (
                  <p className="text-sm text-gray-900 mt-2">
                    選択: {selectedFile.name}
                  </p>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <p className="text-sm text-green-800">
                インポートが完了しました！
              </p>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              disabled={isImporting}
            >
              キャンセル
            </button>
            <button
              onClick={handleImport}
              disabled={!selectedFile || !reportMonth || isImporting}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isImporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  インポート中...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  インポート
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
