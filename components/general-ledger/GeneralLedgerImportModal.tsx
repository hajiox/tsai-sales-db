// /components/general-ledger/GeneralLedgerImportModal.tsx ver.13
'use client';

import { useState, useEffect } from 'react';
import { X, Upload, AlertCircle, CheckCircle, FileSpreadsheet } from 'lucide-react';

interface ImportResult {
  success: boolean;
  message: string;
  details?: {
    processedSheets: number;
    totalTransactions: number;
    accounts: number;
    errors?: string[];
  };
}

interface GeneralLedgerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export default function GeneralLedgerImportModal({
  isOpen,
  onClose,
  onImportComplete
}: GeneralLedgerImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [reportMonth, setReportMonth] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>('');

  // 現在の年月を初期値として設定
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    setReportMonth(`${year}-${month}`);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // ファイル形式チェック
      if (!selectedFile.name.match(/\.(xls|xlsx)$/)) {
        setError('Excel形式（.xls, .xlsx）のファイルを選択してください');
        return;
      }
      setFile(selectedFile);
      setError('');
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!file || !reportMonth) {
      setError('ファイルと対象月を選択してください');
      return;
    }

    setIsImporting(true);
    setError('');
    setImportResult(null);

    try {
      console.log('インポート開始...');
      
      // FormDataにファイルを直接追加
      const formData = new FormData();
      formData.append('file', file);
      formData.append('reportMonth', `${reportMonth}-01`);

      const response = await fetch('/api/general-ledger/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'インポートに失敗しました');
      }

      setImportResult(result);
      console.log('インポート成功:', result);
      
      // 成功時は親コンポーネントに通知
      if (result.success) {
        onImportComplete();
      }
    } catch (err) {
      console.error('インポートエラー:', err);
      setError(err instanceof Error ? err.message : 'インポート中にエラーが発生しました');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setImportResult(null);
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleClose} />
        
        <div className="relative inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              type="button"
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
              onClick={handleClose}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
              <Upload className="h-6 w-6 text-blue-600" />
            </div>
            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                総勘定元帳インポート
              </h3>
              
              <div className="mt-4 space-y-4">
                {/* 対象月選択 */}
                <div>
                  <label htmlFor="reportMonth" className="block text-sm font-medium text-gray-700">
                    対象月
                  </label>
                  <input
                    type="month"
                    id="reportMonth"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    disabled={isImporting}
                  />
                </div>

                {/* ファイル選択 */}
                <div>
                  <label htmlFor="file" className="block text-sm font-medium text-gray-700">
                    Excelファイル選択
                  </label>
                  <div className="mt-1 flex items-center">
                    <FileSpreadsheet className="h-8 w-8 text-gray-400 mr-2" />
                    <input
                      type="file"
                      id="file"
                      accept=".xls,.xlsx"
                      onChange={handleFileChange}
                      className="block w-full text-sm text-gray-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-md file:border-0
                        file:text-sm file:font-semibold
                        file:bg-blue-50 file:text-blue-700
                        hover:file:bg-blue-100"
                      disabled={isImporting}
                    />
                  </div>
                  {file && (
                    <p className="mt-1 text-sm text-gray-500">
                      選択: {file.name}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    ※ 総勘定元帳のExcelファイルをそのままアップロードしてください
                  </p>
                </div>

                {/* エラー表示 */}
                {error && (
                  <div className="rounded-md bg-red-50 p-4">
                    <div className="flex">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                      <div className="ml-3">
                        <p className="text-sm text-red-800">{error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 成功メッセージ */}
                {importResult?.success && (
                  <div className="rounded-md bg-green-50 p-4">
                    <div className="flex">
                      <CheckCircle className="h-5 w-5 text-green-400" />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-green-800">
                          {importResult.message}
                        </p>
                        {importResult.details && (
                          <div className="mt-2 text-sm text-green-700">
                            <p>処理シート数: {importResult.details.processedSheets}</p>
                            <p>取引件数: {importResult.details.totalTransactions}</p>
                            <p>勘定科目数: {importResult.details.accounts}</p>
                            {importResult.details.errors && (
                              <div className="mt-2">
                                <p className="text-red-700">エラー:</p>
                                {importResult.details.errors.map((err, idx) => (
                                  <p key={idx} className="text-sm text-red-600 ml-2">- {err}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!file || !reportMonth || isImporting}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isImporting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      インポート中...
                    </>
                  ) : (
                    'インポート実行'
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
