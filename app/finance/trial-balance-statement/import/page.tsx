'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Settings2,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';

type Encoding = 'auto' | 'utf-8' | 'shift_jis';
type Status = 'idle' | 'uploading' | 'done' | 'error';
type FileStatus = 'ready' | 'uploading' | 'done' | 'error';

type ImportFileItem = {
  id: string;
  file: File;
  preview: string[];
  targetMonth: string;
  detectedMonth: string | null;
  usedEncoding: Exclude<Encoding, 'auto'>;
  status: FileStatus;
  message: string;
};

function countReplacementChars(value: string) {
  return (value.match(/\uFFFD/g) || []).length;
}

function decodeBuffer(buffer: ArrayBuffer, encoding: Exclude<Encoding, 'auto'>) {
  return new TextDecoder(encoding, { fatal: false }).decode(buffer);
}

function autoDecode(buffer: ArrayBuffer) {
  const utf8 = decodeBuffer(buffer, 'utf-8');
  const sjis = decodeBuffer(buffer, 'shift_jis');
  return countReplacementChars(sjis) < countReplacementChars(utf8)
    ? { text: sjis, encoding: 'shift_jis' as const }
    : { text: utf8, encoding: 'utf-8' as const };
}

function decodeFileBuffer(buffer: ArrayBuffer, encoding: Encoding) {
  if (encoding === 'auto') return autoDecode(buffer);
  return {
    text: decodeBuffer(buffer, encoding),
    encoding,
  };
}

function detectMonth(text: string) {
  const reiwaMonths = [...text.matchAll(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*\d+\s*日/g)]
    .map((match) => `${2018 + Number(match[1])}-${String(Number(match[2])).padStart(2, '0')}`);
  const westernMonths = [...text.matchAll(/(20\d{2})[/-](\d{1,2})[/-]\d{1,2}/g)]
    .map((match) => `${match[1]}-${match[2].padStart(2, '0')}`);

  return [...reiwaMonths, ...westernMonths].sort().at(-1) || null;
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function makeFileId(file: File, index: number) {
  return `${fileKey(file)}:${index}:${Date.now()}`;
}

export default function TrialBalanceStatementImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ImportFileItem[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<Encoding>('auto');
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [processedCount, setProcessedCount] = useState(0);
  const [lastImportedMonth, setLastImportedMonth] = useState<string | null>(null);

  async function addFiles(selectedFiles: File[]) {
    if (selectedFiles.length === 0) return;
    setStatus('idle');
    setMessage('');
    setProcessedCount(0);
    setLastImportedMonth(null);

    const existingKeys = new Set(files.map(item => fileKey(item.file)));
    const uniqueFiles = selectedFiles.filter(file => !existingKeys.has(fileKey(file)));
    const prepared = await Promise.all(uniqueFiles.map(async (file, index): Promise<ImportFileItem> => {
      const decoded = decodeFileBuffer(await file.arrayBuffer(), encoding);
      const detectedMonth = detectMonth(decoded.text);
      return {
        id: makeFileId(file, index),
        file,
        preview: decoded.text.split(/\r?\n/).slice(0, 12),
        targetMonth: detectedMonth || '',
        detectedMonth,
        usedEncoding: decoded.encoding,
        status: 'ready',
        message: '',
      };
    }));

    if (prepared.length === 0) {
      setMessage('同じファイルはすでに選択されています。');
      return;
    }

    setFiles(current => [...current, ...prepared]);
    setActiveFileId(current => current || prepared[0].id);
  }

  function updateFile(id: string, patch: Partial<ImportFileItem>) {
    setFiles(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function removeFile(id: string) {
    setFiles(current => {
      const next = current.filter(item => item.id !== id);
      setActiveFileId(active => active === id ? (next[0]?.id || null) : active);
      return next;
    });
  }

  async function changeEncoding(nextEncoding: Encoding) {
    setEncoding(nextEncoding);
    setStatus('idle');
    setMessage('');
    const updated = await Promise.all(files.map(async item => {
      const decoded = decodeFileBuffer(await item.file.arrayBuffer(), nextEncoding);
      const detectedMonth = detectMonth(decoded.text);
      return {
        ...item,
        preview: decoded.text.split(/\r?\n/).slice(0, 12),
        detectedMonth,
        targetMonth: item.targetMonth || detectedMonth || '',
        usedEncoding: decoded.encoding,
        status: item.status === 'done' ? item.status : 'ready' as FileStatus,
        message: item.status === 'done' ? item.message : '',
      };
    }));
    setFiles(updated);
  }

  async function upload() {
    const pendingFiles = files.filter(item => item.status !== 'done');
    if (pendingFiles.length === 0) {
      setStatus('error');
      setMessage(files.length === 0 ? 'ファイルを選択してください。' : 'すべて取り込み済みです。');
      return;
    }

    const invalidMonth = pendingFiles.find(item => !/^\d{4}-(0[1-9]|1[0-2])$/.test(item.targetMonth));
    if (invalidMonth) {
      setStatus('error');
      setMessage(`${invalidMonth.file.name} の対象月を指定してください。`);
      return;
    }

    const monthCounts = new Map<string, number>();
    for (const item of files) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(item.targetMonth)) continue;
      monthCounts.set(item.targetMonth, (monthCounts.get(item.targetMonth) || 0) + 1);
    }
    const duplicatedMonth = [...monthCounts.entries()].find(([, count]) => count > 1)?.[0];
    if (duplicatedMonth) {
      setStatus('error');
      setMessage(`${duplicatedMonth} のファイルが複数あります。同じ月は後のファイルで上書きされるため、1ファイルにしてください。`);
      return;
    }

    setStatus('uploading');
    setProcessedCount(0);
    setLastImportedMonth(null);
    setMessage(`${pendingFiles.length}ファイルを順番に取り込んでいます...`);

    let successCount = 0;
    let errorCount = 0;
    let latestMonth: string | null = null;

    for (let index = 0; index < pendingFiles.length; index += 1) {
      const item = pendingFiles[index];
      updateFile(item.id, { status: 'uploading', message: '取り込み中' });

      try {
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('encoding', item.usedEncoding);
        formData.append('reportMonth', item.targetMonth);

        const response = await fetch('/api/finance/trial-balance-statement/import', {
          method: 'POST',
          body: formData,
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json?.error || '取込に失敗しました');

        successCount += 1;
        if (!latestMonth || json.month > latestMonth) latestMonth = json.month;
        updateFile(item.id, {
          status: 'done',
          message: `${json.stats.rows}行（BS ${json.stats.bsRows} / PL ${json.stats.plRows}）`,
        });
      } catch (error: any) {
        errorCount += 1;
        updateFile(item.id, {
          status: 'error',
          message: error?.message || '取り込みに失敗しました',
        });
      }
      setProcessedCount(index + 1);
    }

    setLastImportedMonth(latestMonth);
    if (errorCount > 0) {
      setStatus('error');
      setMessage(`${successCount}ファイル成功、${errorCount}ファイル失敗。失敗したファイルを確認して再実行してください。`);
    } else {
      setStatus('done');
      setMessage(`${successCount}ファイルの取り込みが完了しました。`);
    }
  }

  function clear() {
    setFiles([]);
    setActiveFileId(null);
    setStatus('idle');
    setMessage('');
    setProcessedCount(0);
    setLastImportedMonth(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const isUploading = status === 'uploading';
  const pendingCount = files.filter(item => item.status !== 'done').length;
  const activeFile = files.find(item => item.id === activeFileId) || files[0] || null;

  return (
    <div className="p-6 max-w-[960px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </span>
            合計残高試算表インポート
          </h1>
          <p className="text-sm text-slate-500 mt-1 ml-[52px]">
            会計事務所から受け取った試算表TXT/CSVを取り込み、総勘定元帳の月次残高と突合します。
          </p>
        </div>
        <button
          onClick={() => router.push('/finance/dashboard')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          ダッシュボードへ戻る
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-sm text-slate-700">取込設定</h2>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm font-semibold text-slate-700 w-28 shrink-0">文字コード</label>
            <select
              value={encoding}
              onChange={(event) => void changeEncoding(event.target.value as Encoding)}
              disabled={isUploading}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white cursor-pointer"
            >
              <option value="auto">自動判定</option>
              <option value="utf-8">UTF-8</option>
              <option value="shift_jis">Shift_JIS</option>
            </select>
            <span className="text-xs text-slate-400">対象月と判定結果はファイルごとに表示します。</span>
          </div>
        </div>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void addFiles(Array.from(event.dataTransfer.files || []));
        }}
        onClick={() => fileRef.current?.click()}
        className={`relative bg-white rounded-2xl shadow-sm border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-emerald-400 bg-emerald-50/50'
            : files.length > 0
              ? 'border-emerald-300 bg-emerald-50/30'
              : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".csv,.txt,text/csv,text/plain"
          onChange={(event) => {
            const selected = Array.from(event.target.files || []);
            event.target.value = '';
            void addFiles(selected);
          }}
          className="hidden"
        />
        <div className="space-y-2">
          {files.length > 0
            ? <FileText className="w-10 h-10 text-emerald-500 mx-auto" />
            : <Upload className="w-10 h-10 text-slate-300 mx-auto" />}
          <div className="font-semibold text-slate-600">複数ファイルをドラッグ&ドロップ</div>
          <div className="text-xs text-slate-400">またはクリックしてまとめて選択</div>
          <div className="text-xs text-slate-400 mt-2">.txt / .csv に対応</div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-700">取込ファイル</h2>
            <span className="text-xs font-semibold text-slate-500">{files.length}件</span>
          </div>
          <div className="divide-y divide-slate-100">
            {files.map(item => (
              <div
                key={item.id}
                className={`grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_150px_110px_42px] sm:items-center ${
                  activeFile?.id === item.id ? 'bg-emerald-50/40' : ''
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <button
                    type="button"
                    title="プレビューを表示"
                    onClick={() => setActiveFileId(item.id)}
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-white hover:text-emerald-600"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800">{item.file.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span>{(item.file.size / 1024).toFixed(1)} KB</span>
                      <span>{item.usedEncoding.toUpperCase()}</span>
                      {item.detectedMonth && (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <Zap className="h-3 w-3" />
                          自動判定 {item.detectedMonth}
                        </span>
                      )}
                    </div>
                    {item.message && (
                      <div className={`mt-1 text-xs ${item.status === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
                        {item.message}
                      </div>
                    )}
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-500">対象月</span>
                  <input
                    type="month"
                    value={item.targetMonth}
                    disabled={isUploading || item.status === 'done'}
                    onChange={(event) => updateFile(item.id, {
                      targetMonth: event.target.value,
                      detectedMonth: null,
                      status: 'ready',
                      message: '',
                    })}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
                  />
                </label>
                <div className={`text-xs font-bold ${
                  item.status === 'done'
                    ? 'text-emerald-600'
                    : item.status === 'error'
                      ? 'text-red-600'
                      : item.status === 'uploading'
                        ? 'text-emerald-600'
                        : 'text-slate-500'
                }`}>
                  {item.status === 'done' && '完了'}
                  {item.status === 'error' && '失敗'}
                  {item.status === 'uploading' && '取込中'}
                  {item.status === 'ready' && '待機'}
                </div>
                <button
                  type="button"
                  title="一覧から削除"
                  disabled={isUploading}
                  onClick={() => removeFile(item.id)}
                  className="grid h-9 w-9 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={upload}
          disabled={pendingCount === 0 || isUploading}
          className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isUploading ? `処理中… ${processedCount}件処理済み` : `${pendingCount}ファイルを取り込む`}
        </button>
        <button
          onClick={clear}
          disabled={isUploading}
          className="inline-flex items-center gap-2 px-4 py-3 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 transition"
        >
          <Trash2 className="h-4 w-4" />
          クリア
        </button>
        <button
          onClick={() => router.push(lastImportedMonth
            ? `/finance/trial-balance-statement?month=${lastImportedMonth}`
            : '/finance/trial-balance-statement')}
          className="inline-flex items-center gap-2 px-4 py-3 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
        >
          表示画面へ
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-3 px-5 py-4 rounded-xl text-sm ${
          status === 'error'
            ? 'bg-red-50 border border-red-200 text-red-700'
            : status === 'done'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-blue-50 border border-blue-200 text-blue-700'
        }`}>
          {status === 'error' && <AlertTriangle className="w-4 h-4 shrink-0" />}
          {status === 'done' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {isUploading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
          {message}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <Eye className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-sm text-slate-700">プレビュー</h2>
        </div>
        <div className="p-6">
          {!activeFile ? (
            <div className="text-sm text-slate-400 text-center py-4">ファイル未選択</div>
          ) : (
            <pre className="whitespace-pre-wrap text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-4 max-h-[320px] overflow-auto font-mono leading-relaxed">
              {activeFile.preview.join('\n')}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
