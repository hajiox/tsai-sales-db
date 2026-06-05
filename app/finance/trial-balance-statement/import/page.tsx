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
  Upload,
  Zap,
} from 'lucide-react';

type Encoding = 'auto' | 'utf-8' | 'shift_jis';
type Status = 'idle' | 'uploading' | 'done' | 'error';

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

function detectMonth(text: string) {
  const reiwa = text.match(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*\d+\s*日/);
  if (reiwa) {
    const year = 2018 + Number(reiwa[1]);
    const month = String(Number(reiwa[2])).padStart(2, '0');
    return `${year}-${month}`;
  }

  const western = text.match(/(20\d{2})[/-](\d{1,2})[/-]\d{1,2}/);
  if (western) return `${western[1]}-${western[2].padStart(2, '0')}`;
  return null;
}

export default function TrialBalanceStatementImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [targetMonth, setTargetMonth] = useState('');
  const [detectedMonth, setDetectedMonth] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<Encoding>('auto');
  const [usedEncoding, setUsedEncoding] = useState<Exclude<Encoding, 'auto'> | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function readFile(nextFile: File, nextEncoding: Encoding) {
    const buffer = await nextFile.arrayBuffer();
    if (nextEncoding === 'auto') {
      const decoded = autoDecode(buffer);
      setUsedEncoding(decoded.encoding);
      return decoded.text;
    }
    setUsedEncoding(nextEncoding);
    return decodeBuffer(buffer, nextEncoding);
  }

  async function onPick(nextFile: File | null) {
    setFile(nextFile);
    setPreview([]);
    setStatus('idle');
    setMessage('');
    setDetectedMonth(null);
    setUsedEncoding(null);

    if (!nextFile) return;
    const text = await readFile(nextFile, encoding);
    const lines = text.split(/\r?\n/);
    setPreview(lines.slice(0, 12));

    const detected = detectMonth(text);
    if (detected) {
      setDetectedMonth(detected);
      setTargetMonth(detected);
    }
  }

  async function upload() {
    if (!file) {
      setStatus('error');
      setMessage('ファイルを選択してください。');
      return;
    }

    setStatus('uploading');
    setMessage('合計残高試算表を取り込んでいます...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('encoding', encoding);
      if (targetMonth) formData.append('reportMonth', targetMonth);

      const response = await fetch('/api/finance/trial-balance-statement/import', {
        method: 'POST',
        body: formData,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || '取込に失敗しました');

      setStatus('done');
      setMessage(`取込完了: ${json.stats.rows}行（BS ${json.stats.bsRows}行 / PL ${json.stats.plRows}行）`);
      setTimeout(() => {
        router.push(`/finance/trial-balance-statement?month=${json.month}`);
      }, 700);
    } catch (error: any) {
      setStatus('error');
      setMessage(error?.message || '合計残高試算表の取込に失敗しました。');
    }
  }

  const isUploading = status === 'uploading';

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
        <div className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm font-semibold text-slate-700 w-28 shrink-0">対象月</label>
            <input
              type="month"
              value={targetMonth}
              onChange={(event) => {
                setTargetMonth(event.target.value);
                setDetectedMonth(null);
              }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
            />
            {detectedMonth ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                <Zap className="w-3 h-3" />
                ファイルから自動判定: {detectedMonth}
              </span>
            ) : (
              <span className="text-xs text-slate-400">未指定の場合はファイル内の日付から判定します。</span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm font-semibold text-slate-700 w-28 shrink-0">文字コード</label>
            <select
              value={encoding}
              onChange={async (event) => {
                const nextEncoding = event.target.value as Encoding;
                setEncoding(nextEncoding);
                if (file) {
                  const text = await readFile(file, nextEncoding);
                  setPreview(text.split(/\r?\n/).slice(0, 12));
                }
              }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white cursor-pointer"
            >
              <option value="auto">自動判定</option>
              <option value="utf-8">UTF-8</option>
              <option value="shift_jis">Shift_JIS</option>
            </select>
            {usedEncoding && (
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                プレビュー判定: {usedEncoding.toUpperCase()}
              </span>
            )}
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
          onPick(event.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => fileRef.current?.click()}
        className={`relative bg-white rounded-2xl shadow-sm border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-emerald-400 bg-emerald-50/50'
            : file
              ? 'border-emerald-300 bg-emerald-50/30'
              : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={(event) => onPick(event.target.files?.[0] ?? null)}
          className="hidden"
        />
        {file ? (
          <div className="space-y-2">
            <FileText className="w-10 h-10 text-emerald-500 mx-auto" />
            <div className="font-semibold text-slate-700">{file.name}</div>
            <div className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB / クリックで変更</div>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="font-semibold text-slate-600">ファイルをドラッグ&ドロップ</div>
            <div className="text-xs text-slate-400">またはクリックしてファイルを選択</div>
            <div className="text-xs text-slate-400 mt-2">.txt / .csv に対応</div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={upload}
          disabled={!file || isUploading}
          className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          取り込む
        </button>
        <button
          onClick={() => router.push('/finance/trial-balance-statement')}
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
          {preview.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-4">ファイル未選択</div>
          ) : (
            <pre className="whitespace-pre-wrap text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-4 max-h-[320px] overflow-auto font-mono leading-relaxed">
              {preview.join('\n')}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
