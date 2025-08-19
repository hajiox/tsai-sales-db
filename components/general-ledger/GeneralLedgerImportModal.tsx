// ver.18 (2025-08-19 JST) - add default export for Next build
'use client';

import { useState } from 'react';
import { X, FileText, Upload, AlertCircle } from 'lucide-react';

interface GeneralLedgerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

function GeneralLedgerImportModal({
  isOpen,
  onClose,
  onImportComplete,
}: GeneralLedgerImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 西暦から令和への変換
  const toReiwa = (year: number): string => {
    const reiwaStart = 2019;
    if (year >= reiwaStart) {
      const reiwaYear = year - reiwaStart + 1;
      return reiwaYear === 1 ? '令和元' : `令和${reiwaYear}`;
    }
    return '';
  };

  // 年の選択肢を生成（過去3年から来年まで）
  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let year = currentYear - 3; year <= currentYear + 1; year++) {
    yearOptions.push(year);
  }

  // 月の選択肢
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

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
    if (!selectedFile) {
      setError('ファイルを選択してください');
      return;
    }

    setIsImporting(true);
    setError(null);
    setSuccess(false);

    try {
      const reportMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      
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
            <div className="flex space-x-2">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="flex-1 p-2 border rounded-md"
                disabled={isImporting}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}年（{toReiwa(year)}年）
                  </option>
                ))}
              </select>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-24 p-2 border rounded-md"
                disabled={isImporting}
              >
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {month}月
                  </option>
                ))}
              </select>
            </div>
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
              disabled={!selectedFile || isImporting}
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

// ver.18 (2025-08-19 JST) - add default export for Next build
export default GeneralLedgerImportModal;
export { GeneralLedgerImportModal };
