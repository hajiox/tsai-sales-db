// /components/general-ledger/GeneralLedgerImportModal.tsx ver.2
'use client';

import { useState } from 'react';
import { X, Upload, AlertCircle, CheckCircle, FileText } from 'lucide-react';

interface ImportResult {
  success: boolean;
  message: string;
  details?: {
    transactions: number;
    totalDebit: number;
    totalCredit: number;
    closingBalance: number;
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
  const [accountCode, setAccountCode] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>('');

  // 現在の年月を初期値として設定
  useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    setReportMonth(`${year}-${month}`);
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // ファイル形式チェック
      if (!selectedFile.name.match(/\.csv$/)) {
        setError('CSV形式のファイルを選択してください');
        return;
      }
      setFile(selectedFile);
      setError('');
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!file || !reportMonth || !accountCode || !accountName) {
      setError('すべての項目を入力してください');
      return;
    }

    setIsImporting(true);
    setError('');
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('reportMonth', `${reportMonth}-01`);
      formData.append('accountCode', accountCode);
      formData.append('accountName', accountName);

      const response = await fetch('/api/general-ledger/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'インポートに失敗しました');
      }

      setImportResult(result);
      
      // 成功時は親コンポーネントに通知
      if (result.success) {
        setTimeout(() => {
          onImportComplete();
          handleClose();
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'インポート中にエラーが発生しました');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setAccountCode('');
    setAccountName('');
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
                総勘定元帳CSVインポート
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

                {/* 勘定科目コード */}
                <div>
                  <label htmlFor="accountCode" className="block text-sm font-medium text-gray-700">
                    勘定科目コード
                  </label>
                  <input
                    type="text"
                    id="accountCode"
                    value={accountCode}
                    o
