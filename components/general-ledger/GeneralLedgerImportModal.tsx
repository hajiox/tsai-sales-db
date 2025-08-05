// /components/general-ledger/GeneralLedgerImportModal.tsx ver.11
'use client';

import { useState, useEffect } from 'react';
import { X, Upload, AlertCircle, CheckCircle, FileSpreadsheet } from 'lucide-react';

// グローバル宣言
declare global {
  interface Window {
    XLSX: any;
  }
}

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

// 日付パーサー
function parseJapaneseDate(dateStr: string, baseYear: number = 2025): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  
  const trimmed = dateStr.trim();
  if (trimmed === '') return '';
  
  // "7. 2. 1" 形式
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    const month = parts[1].trim().padStart(2, '0');
    const day = parts[2].trim().padStart(2, '0');
    const year = parts[0].trim() === '7' ? baseYear : parseInt(parts[0]) + 2018;
    return `${year}-${month}-${day}`;
  }
  
  return '';
}

// 数値パーサー
function parseNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,、]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
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
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // 現在の年月を初期値として設定
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    setReportMonth(`${year}-${month}`);
  }, []);

  // SheetJSライブラリを読み込む（CDNを変更）
  useEffect(() => {
    if (!scriptLoaded && typeof window !== 'undefined') {
      // 既存のスクリプトをチェック
      const existingScript = document.querySelector('script[src*="xlsx"]');
      if (existingScript) {
        setScriptLoaded(true);
        return;
      }

      const script = document.createElement('script');
      // CDN URLを変更
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.async = true;
      script.onload = () => {
        console.log('SheetJS loaded successfully');
        if (window.XLSX) {
          setScriptLoaded(true);
        } else {
          setError('SheetJSの読み込みに失敗しました');
        }
      };
      script.onerror = () => {
        console.error('Failed to load SheetJS');
        setError('ライブラリの読み込みに失敗しました');
      };
      document.body.appendChild(script);
    }
  }, [scriptLoaded]);

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

  const processExcelFile = async (file: File): Promise<any> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          
          // XLSXオブジェクトの存在確認
          if (!window.XLSX) {
            throw new Error('SheetJSライブラリが読み込まれていません');
          }
          
          const XLSX = window.XLSX;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheets = [];
          
          console.log(`ワークブック読み込み完了: ${workbook.SheetNames.length}シート`);
          
          // 各シートを処理
          workbook.SheetNames.forEach((sheetName: string, index: number) => {
            try {
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
              
              if (!jsonData || jsonData.length < 5) {
                console.log(`シート${index + 1}はスキップ（データ不足）`);
                return;
              }
              
              // 勘定科目情報を抽出
              let accountCode = '';
              let accountName = '';
              
              // 3行目の最初のセルから勘定科目コードを探す
              for (let col = 0; col < 5; col++) {
                if (jsonData[2] && jsonData[2][col]) {
                  const cellValue = String(jsonData[2][col]).trim();
                  // 数字のみ、または数字とハイフンを含む値を勘定科目コードとして認識
                  if (/^[\d\-]+$/.test(cellValue) && cellValue.length >= 4) {
                    accountCode = cellValue;
                    break;
                  }
                }
              }
              
              // コードが見つからない場合は、シート番号を基にした仮のコードを生成
              if (!accountCode) {
                accountCode = `SHEET${(index + 1).toString().padStart(3, '0')}`;
              }
              
              // 2行目に科目名（複数セルに分かれている可能性）
              if (jsonData[1]) {
                const nameParts = [];
                for (let i = 2; i < Math.min(6, jsonData[1].length); i++) {
                  if (jsonData[1][i] && String(jsonData[1][i]).trim() && 
                      !String(jsonData[1][i]).includes('ﾍﾟｰｼﾞ')) {
                    nameParts.push(String(jsonData[1][i]).trim());
                  }
                }
                accountName = nameParts.join('') || `勘定科目${index + 1}`;
              }
              
              console.log(`シート${index + 1}: コード=${accountCode}, 名称=${accountName}`);
              
              // ヘッダー行を探す
              let headerRow = -1;
              for (let i = 0; i < Math.min(10, jsonData.length); i++) {
                if (jsonData[i] && jsonData[i][0] && 
                    String(jsonData[i][0]).includes('日') && 
                    String(jsonData[i][0]).includes('付')) {
                  headerRow = i;
                  console.log(`ヘッダー行: ${i}行目`);
                  break;
                }
              }
              
              if (headerRow === -1) {
                console.log(`シート${index + 1}はスキップ（ヘッダー行なし）`);
                return;
              }
              
              // 取引データを抽出
              const transactions = [];
              let rowNumber = 0;
              
              for (let i = headerRow + 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || !row[0]) continue;
                
                rowNumber++;
                const dateStr = String(row[0]).trim();
                if (!dateStr || dateStr === ' ') continue;
                
                // 前月繰越行の処理
                if (row[1] && String(row[1]).includes('前月繰越')) {
                  // 前月繰越の残高はH列（インデックス7）
                  const openingBalance = parseNumber(row[7]);
                  transactions.push({
                    isOpeningBalance: true,
                    balance: openingBalance
                  });
                  console.log(`前月繰越: ${openingBalance}`);
                  continue;
                }
                
                // 日付をパース
                const transactionDate = parseJapaneseDate(dateStr);
                if (!transactionDate) continue;
                
                // 金額列の位置を特定
                // F列（インデックス5）: 借方金額
                // G列（インデックス6）: 貸方金額
                // H列（インデックス7）: 残高
                const debitAmount = parseNumber(row[5]);
                const creditAmount = parseNumber(row[6]);
                const balance = parseNumber(row[7]);
                
                // デバッグ用ログ（最初の5行のみ）
                if (rowNumber <= 5) {
                  console.log(`行${rowNumber}: 借方=${debitAmount}, 貸方=${creditAmount}, 残高=${balance}`);
                }
                
                transactions.push({
                  date: transactionDate,
                  counterAccount: row[1] ? String(row[1]).trim() : null,
                  description: row[2] ? String(row[2]).trim() : null,
                  debit: debitAmount,
                  credit: creditAmount,
                  balance: balance,
                  rowNumber: rowNumber
                });
              }
              
              if (transactions.length > 0) {
                sheets.push({
                  sheetName,
                  accountCode,
                  accountName,
                  transactions
                });
                console.log(`シート${index + 1}: ${transactions.length}件の取引を抽出`);
              }
            } catch (sheetError) {
              console.error(`シート${index + 1}の処理エラー:`, sheetError);
            }
          });
          
          console.log(`処理完了: ${sheets.length}シート`);
          resolve({ sheets });
        } catch (err) {
          console.error('Excel処理エラー:', err);
          reject(err);
        }
      };
      
      reader.onerror = (err) => {
        console.error('ファイル読み込みエラー:', err);
        reject(new Error('ファイルの読み込みに失敗しました'));
      };
      
      // ArrayBufferとして読み込む
      reader.readAsArrayBuffer(file);
    });
  };

  const handleImport = async () => {
    if (!file || !reportMonth) {
      setError('ファイルと対象月を選択してください');
      return;
    }

    if (!scriptLoaded || !window.XLSX) {
      setError('ライブラリを読み込み中です。しばらくお待ちください。');
      return;
    }

    setIsImporting(true);
    setError('');
    setImportResult(null);

    try {
      console.log('インポート開始...');
      
      // Excelファイルを処理
      const processedData = await processExcelFile(file);
      
      console.log('API送信準備...');
      
      // APIに送信
      const formData = new FormData();
      formData.append('fileData', JSON.stringify(processedData));
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
                  disabled={!file || !reportMonth || isImporting || !scriptLoaded}
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
