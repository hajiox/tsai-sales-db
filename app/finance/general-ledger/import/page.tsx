// app/finance/general-ledger/import/page.tsx
// 仕訳CSVインポート — モダンUI ver.2
'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload,
  FileText,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Eye,
  Settings2,
  Zap,
} from 'lucide-react';

type Encoding = 'auto' | 'utf-8' | 'shift_jis';
type ImportStatus = 'ready' | 'uploading' | 'done' | 'error';

type ImportFileItem = {
  id: string;
  file: File;
  preview: string[];
  targetMonth: string;
  detectedMonth: string | null;
  usedEncoding: Exclude<Encoding, 'auto'>;
  status: ImportStatus;
  message: string;
};

function toReiwa(year: number): string {
  const r = year - 2018;
  if (r === 1) return 'R1';
  if (r >= 2) return `R${r}`;
  return `H${year - 1988}`;
}

function countReplacementChars(value: string) {
  return (value.match(/\uFFFD/g) || []).length;
}

function decodeBuffer(buffer: ArrayBuffer, encoding: Exclude<Encoding, 'auto'>) {
  return new TextDecoder(encoding, { fatal: false }).decode(buffer);
}

function decodeFileBuffer(buffer: ArrayBuffer, encoding: Encoding) {
  if (encoding !== 'auto') {
    return { text: decodeBuffer(buffer, encoding), usedEncoding: encoding };
  }

  const utf8 = decodeBuffer(buffer, 'utf-8');
  const shiftJis = decodeBuffer(buffer, 'shift_jis');
  return countReplacementChars(shiftJis) < countReplacementChars(utf8)
    ? { text: shiftJis, usedEncoding: 'shift_jis' as const }
    : { text: utf8, usedEncoding: 'utf-8' as const };
}

function detectMonthFromCSV(text: string): string | null {
  const monthCounts = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    const columns = line.split(/[,\t]/);
    const year = columns[3]?.trim();
    const month = columns[4]?.trim();
    if (year && month && /^\d{4}$/.test(year) && /^\d{1,2}$/.test(month)) {
      const yearMonth = `${year}-${month.padStart(2, '0')}`;
      monthCounts.set(yearMonth, (monthCounts.get(yearMonth) || 0) + 1);
    }
  }

  let detected: string | null = null;
  let highestCount = 0;
  for (const [yearMonth, count] of monthCounts) {
    if (count > highestCount) {
      detected = yearMonth;
      highestCount = count;
    }
  }
  return detected;
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function makeFileId(file: File, index: number) {
  return `${fileKey(file)}:${index}:${Date.now()}`;
}

export default function GeneralLedgerImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<ImportFileItem[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'refreshing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [encoding, setEncoding] = useState<Encoding>('auto');
  const [dragOver, setDragOver] = useState(false);
  const [importedMonths, setImportedMonths] = useState<string[]>([]);
  const [processedCount, setProcessedCount] = useState(0);

  // 取り込み済み月を取得
  useEffect(() => {
    fetch('/api/finance/import-status')
      .then(r => r.json())
      .then(j => setImportedMonths((j.months || []).map((m: any) => m.month)))
      .catch(() => {});
  }, []);

  // 未取り込み月を算出
  const missingMonths = useMemo(() => {
    if (importedMonths.length === 0) return [];
    const sorted = [...importedMonths].sort();
    const first = sorted[0];
    const now = new Date();
    const lastYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const missing: string[] = [];
    const [fy, fm] = first.split('-').map(Number);
    let y = fy, m = fm;
    while (`${y}-${String(m).padStart(2, '0')}` <= lastYM) {
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      if (!importedMonths.includes(ym)) missing.push(ym);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return missing;
  }, [importedMonths]);

  // --- handlers ---
  async function addFiles(selectedFiles: File[]) {
    if (selectedFiles.length === 0) return;
    setStatus('idle');
    setMessage('');
    setProcessedCount(0);

    const existingKeys = new Set(files.map(item => fileKey(item.file)));
    const uniqueFiles = selectedFiles.filter(file => !existingKeys.has(fileKey(file)));
    const prepared = await Promise.all(uniqueFiles.map(async (file, index): Promise<ImportFileItem> => {
      const decoded = decodeFileBuffer(await file.arrayBuffer(), encoding);
      const detectedMonth = detectMonthFromCSV(decoded.text);
      return {
        id: makeFileId(file, index),
        file,
        preview: decoded.text.split(/\r?\n/).slice(0, 8),
        targetMonth: detectedMonth || '',
        detectedMonth,
        usedEncoding: decoded.usedEncoding,
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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void addFiles(Array.from(e.dataTransfer.files || []));
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
      const detectedMonth = detectMonthFromCSV(decoded.text);
      return {
        ...item,
        preview: decoded.text.split(/\r?\n/).slice(0, 8),
        detectedMonth,
        targetMonth: item.targetMonth || detectedMonth || '',
        usedEncoding: decoded.usedEncoding,
        status: item.status === 'done' ? item.status : 'ready' as ImportStatus,
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
    setMessage(`${pendingFiles.length}ファイルを順番に取り込んでいます...`);

    let successCount = 0;
    let errorCount = 0;

    for (let index = 0; index < pendingFiles.length; index += 1) {
      const item = pendingFiles[index];
      updateFile(item.id, { status: 'uploading', message: '取り込み中' });

      try {
        const decoded = decodeFileBuffer(await item.file.arrayBuffer(), item.usedEncoding);
        const fd = new FormData();
        fd.append(
          'file',
          new Blob([decoded.text], { type: 'text/plain;charset=utf-8' }),
          item.file.name.replace(/\.(txt|csv|tsv)$/i, '') + '.csv'
        );
        fd.append('reportMonth', item.targetMonth);
        fd.append(
          'options',
          JSON.stringify({
            saveOriginal: true,
            encoding: item.usedEncoding,
          })
        );

        const res = await fetch('/api/general-ledger/import', { method: 'POST', body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? res.statusText);

        successCount += 1;
        updateFile(item.id, {
          status: 'done',
          message: `${json?.stats?.transactions ?? 0}件`,
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

    if (successCount > 0) {
      setStatus('refreshing');
      setMessage('マテリアライズドビュー更新中…');
      try {
        const refreshResponse = await fetch('/api/finance/refresh', { method: 'POST' });
        if (!refreshResponse.ok) throw new Error('集計更新に失敗しました');

        const r3 = await fetch('/api/finance/import-status');
        const j3 = await r3.json();
        setImportedMonths((j3.months || []).map((m: any) => m.month));
      } catch (error: any) {
        setStatus('error');
        setMessage(`${successCount}ファイルの取込は完了しましたが、${error?.message || '集計更新に失敗しました'}。`);
        return;
      }
    }

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
    if (fileRef.current) fileRef.current.value = '';
  }

  const isProcessing = status === 'uploading' || status === 'refreshing';
  const pendingCount = files.filter(item => item.status !== 'done').length;
  const activeFile = files.find(item => item.id === activeFileId) || files[0] || null;

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" />
            </div>
            仕訳CSVインポート
          </h1>
          <p className="text-sm text-slate-500 mt-1 ml-[52px]">
            総勘定元帳CSVファイルを取り込みます
          </p>
        </div>
        <button
          onClick={() => router.push('/finance/dashboard')}
          className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          ダッシュボードに戻る
        </button>
      </div>

      {/* 未取り込み月アラート */}
      {missingMonths.length > 0 && (
        <div className="flex items-start gap-3 px-5 py-4 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-amber-800 mb-1">未取り込みの月があります（{missingMonths.length}件）</div>
            <div className="flex flex-wrap gap-1.5">
              {missingMonths.map(ym => (
                <span key={ym} className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md font-medium">
                  {ym.replace('-', '年')}月（{toReiwa(parseInt(ym.split('-')[0]))}）
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 設定セクション */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-sm text-slate-700">インポート設定</h2>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm font-semibold text-slate-700 w-28 shrink-0">文字コード</label>
            <select
              value={encoding}
              onChange={(e) => void changeEncoding(e.target.value as Encoding)}
              disabled={isProcessing}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white cursor-pointer"
            >
              <option value="auto">自動判別（推奨）</option>
              <option value="utf-8">UTF-8</option>
              <option value="shift_jis">Shift_JIS（Windows）</option>
            </select>
            <span className="text-xs text-slate-400">対象月と判定結果はファイルごとに表示します。</span>
          </div>
        </div>
      </div>

      {/* ファイルドロップゾーン */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`relative bg-white rounded-2xl shadow-sm border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-blue-400 bg-blue-50/50'
            : files.length > 0
            ? 'border-emerald-300 bg-emerald-50/30'
            : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          onChange={(e) => {
            const selected = Array.from(e.target.files || []);
            e.target.value = '';
            void addFiles(selected);
          }}
          className="hidden"
        />
        <div className="space-y-2">
          {files.length > 0
            ? <FileText className="w-10 h-10 text-emerald-500 mx-auto" />
            : <Upload className="w-10 h-10 text-slate-300 mx-auto" />}
          <div className="font-semibold text-slate-600">複数ファイルをドラッグ＆ドロップ</div>
          <div className="text-xs text-slate-400">またはクリックしてまとめて選択</div>
          <div className="text-xs text-slate-400 mt-2">.csv, .tsv, .txt（UTF-8 / Shift_JIS）</div>
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
                  activeFile?.id === item.id ? 'bg-blue-50/40' : ''
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <button
                    type="button"
                    title="プレビューを表示"
                    onClick={() => setActiveFileId(item.id)}
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-white hover:text-blue-600"
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
                    disabled={isProcessing || item.status === 'done'}
                    onChange={(e) => updateFile(item.id, {
                      targetMonth: e.target.value,
                      detectedMonth: null,
                      status: 'ready',
                      message: '',
                    })}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  />
                </label>
                <div className={`text-xs font-bold ${
                  item.status === 'done'
                    ? 'text-emerald-600'
                    : item.status === 'error'
                      ? 'text-red-600'
                      : item.status === 'uploading'
                        ? 'text-blue-600'
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
                  disabled={isProcessing}
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

      {/* アクションボタン */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={upload}
          disabled={pendingCount === 0 || isProcessing}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isProcessing ? `処理中… ${processedCount}件処理済み` : `${pendingCount}ファイルを取り込む`}
        </button>
        <button
          onClick={clear}
          disabled={isProcessing}
          className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 transition"
        >
          <Trash2 className="w-4 h-4" />
          クリア
        </button>

        {status === 'done' && (
          <button
            onClick={() => router.push('/finance/dashboard')}
            className="flex items-center gap-2 px-4 py-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition ml-auto"
          >
            <CheckCircle2 className="w-4 h-4" />
            ダッシュボードで確認
          </button>
        )}
      </div>

      {/* ステータス */}
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
          {isProcessing && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
          {message}
        </div>
      )}

      {/* プレビュー */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <Eye className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-sm text-slate-700">プレビュー（先頭8行）</h2>
        </div>
        <div className="p-6">
          {!activeFile ? (
            <div className="text-sm text-slate-400 text-center py-4">ファイル未選択</div>
          ) : (
            <pre className="whitespace-pre-wrap text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-4 max-h-[280px] overflow-auto font-mono leading-relaxed">
              {activeFile.preview.join('\n')}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
