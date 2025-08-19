// ver.2 (2025-08-19 JST) - add default export
'use client';

import { useState } from 'react';
import { X, FileText, Upload, AlertCircle, Calculator } from 'lucide-react';

interface ClosingImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

function ClosingImportModal({
  isOpen,
  onClose,
  onImportComplete,
}: ClosingImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [importStats, setImportStats] = useState<any>(null);

  // 年度の選択肢を生成（過去3年から今年まで）
  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let year = currentYear - 3; year <= currentYear; year++) {
    yearOptions.push(year);
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
    setImportStats(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('fiscalYear', fiscalYear.toString());

      const response = await fetch('/api/general-ledger/import-closing', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '決算データのインポートに失敗しました');
      }

      console.log('決算インポート成功:', result);
      setSuccess(true);
      setImportStats(result.stats);
      
      // 成功時の処理
      setTimeout(() => {
        setSelectedFile(null);
        setSuccess(false);
        setImportStats(null);
        
        if (typeof onImportComplete === 'function') {
          onImportComplete();
        }
        
        onClose();
      }, 3000);
    } catch (error) {
      console.error('決算インポートエラー:', error);
      setError(error instanceof Error ? error.message : '決算データのインポートに失敗しました');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <Calculator className="h-6 w-6 text-purple-600 mr-2" />
            <h2 className="text-xl font-bold">決算データインポート</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={isImporting}
          >
            <X size={20} />
          </button>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-md p-3 mb-4">
          <p className="text-sm text-purple-800">
            決算月（13月）のCSVファイルをインポートします。
            期末調整や決算整理仕訳が含まれます。
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              決算年度
            </label>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              className="w-full p-2 border rounded-md"
              disabled={isImporting}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}年度（令和{year - 2018}年度）
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              決算CSVファイル選択
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="closing-file-upload"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-purple-600 hover:text-purple-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-purple-500"
                  >
                    <span>ファイルを選択</span>
                    <input
                      id="closing-file-upload"
                      name="closing-file-upload"
                      type="file"
                      className="sr-only"
                      accept=".csv,.txt"
                      onChange={handleFileChange}
                      disabled={isImporting}
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  決算月（13月）のCSVまたはTXTファイル
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

          {success && importStats && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <p className="text-sm text-green-800 font-semibold mb-2">
                決算データインポート完了！
              </p>
              <div className="text-xs text-green-700 space-y-1">
                <p>• 調整仕訳: {importStats.adjustments}件</p>
                <p>• 勘定科目: {importStats.accounts}件</p>
                {importStats.types && importStats.types.length > 0 && (
                  <p>• 種類: {importStats.types.join(', ')}</p>
                )}
              </div>
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
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isImporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  インポート中...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  決算インポート
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ver.2 (2025-08-19 JST) - add default export
export default ClosingImportModal;
export { ClosingImportModal };
