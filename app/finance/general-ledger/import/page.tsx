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
  Info,
  Zap,
} from 'lucide-react';

type Encoding = 'auto' | 'utf-8' | 'shift_jis';

function toReiwa(year: number): string {
  const r = year - 2018;
  if (r === 1) return 'R1';
  if (r >= 2) return `R${r}`;
  return `H${year - 1988}`;
}

export default function GeneralLedgerImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'refreshing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [targetMonth, setTargetMonth] = useState('');
  const [detectedMonth, setDetectedMonth] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<Encoding>('auto');
  const [usedEncoding, setUsedEncoding] = useState<Exclude<Encoding, 'auto'> | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importedMonths, setImportedMonths] = useState<string[]>([]);

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

  // --- helpers ---
  function countReplacementChars(s: string) {
    return (s.match(/\uFFFD/g) || []).length;
  }
  function decodeBuffer(buf: ArrayBuffer, enc: Exclude<Encoding, 'auto'>) {
    return new TextDecoder(enc, { fatal: false }).decode(buf);
  }
  function autoDecode(buf: ArrayBuffer): { text: string; used: Exclude<Encoding, 'auto'> } {
    const utf8 = decodeBuffer(buf, 'utf-8');
    const sjis = decodeBuffer(buf, 'shift_jis');
    return countReplacementChars(sjis) < countReplacementChars(utf8)
      ? { text: sjis, used: 'shift_jis' }
      : { text: utf8, used: 'utf-8' };
  }
  async function readFile(f: File, enc: Encoding) {
    const buf = await f.arrayBuffer();
    if (enc === 'auto') {
      const { text, used } = autoDecode(buf);
      setUsedEncoding(used);
      return text;
    }
    const text = decodeBuffer(buf, enc);
    setUsedEncoding(enc);
    return text;
  }

  /** CSV内の日付列から最頻の年月を検出 */
  function detectMonthFromCSV(text: string): string | null {
    const lines = text.split(/\r?\n/);
    const monthCounts = new Map<string, number>();
    for (const line of lines) {
      const cols = line.split(/[,\t]/);
      // 列3=年, 列4=月 (総勘定元帳CSV形式)
      const year = cols[3]?.trim();
      const month = cols[4]?.trim();
      if (year && month && /^\d{4}$/.test(year) && /^\d{1,2}$/.test(month)) {
        const ym = `${year}-${month.padStart(2, '0')}`;
        monthCounts.set(ym, (monthCounts.get(ym) || 0) + 1);
      }
    }
    if (monthCounts.size === 0) return null;
    // 最頻の年月を返す
    let best = '';
    let bestCount = 0;
    for (const [ym, cnt] of monthCounts) {
      if (cnt > bestCount) { best = ym; bestCount = cnt; }
    }
    return best || null;
  }

  // --- handlers ---
  async function onPick(f: File | null) {
    setFile(f);
    setStatus('idle');
    setMessage('');
    setPreview([]);
    setUsedEncoding(null);
    setDetectedMonth(null);
    if (!f) return;
    const text = await readFile(f, encoding);
    setPreview(text.split(/\r?\n/).slice(0, 8));
    // 年月自動検出
    const detected = detectMonthFromCSV(text);
    if (detected) {
      setDetectedMonth(detected);
      setTargetMonth(`${detected}-01`);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onPick(f);
  }

  async function upload() {
    if (!file) {
      setStatus('error');
      setMessage('ファイルを選択してください');
      return;
    }
    try {
      setStatus('uploading');
      setMessage('取り込み中…');

      const buf = await file.arrayBuffer();
      const encToUse = encoding === 'auto' ? (usedEncoding ?? 'utf-8') : encoding;
      const text = decodeBuffer(buf, encToUse);

      const fd = new FormData();
      fd.append(
        'file',
        new Blob([text], { type: 'text/plain;charset=utf-8' }),
        file.name.replace(/\.(txt|csv|tsv)$/i, '') + '.csv'
      );
      // APIが期待するキー: reportMonth (YYYY-MM形式)
      if (targetMonth) {
        fd.append('reportMonth', targetMonth.slice(0, 7)); // "2023-04"
      }
      fd.append(
        'options',
        JSON.stringify({
          saveOriginal: true,
          encoding: encToUse,
        })
      );

      const res = await fetch('/api/general-ledger/import', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? res.statusText);

      setStatus('refreshing');
      setMessage('マテリアライズドビュー更新中…');
      const r2 = await fetch('/api/finance/refresh', { method: 'POST' });
      if (!r2.ok) throw new Error('マテビュー更新に失敗しました');
      // 未取り込み月アラートを即時更新（awaitで確実に待つ）
      setStatus('refreshing');
      setMessage('取り込み状況を更新中…');
      try {
        const r3 = await fetch('/api/finance/import-status');
        const j3 = await r3.json();
        setImportedMonths((j3.months || []).map((m: any) => m.month));
      } catch {}

      setStatus('done');
      setMessage(`インポート完了（${json?.stats?.transactions ?? '?'}件の仕訳を取り込みました）`);

      // ファイル選択を自動クリア（次のインポートに備える）
      setFile(null);
      setPreview([]);
      setDetectedMonth(null);
      setUsedEncoding(null);
      setTargetMonth('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: any) {
      setStatus('error');
      setMessage(String(e?.message ?? e));
    }
  }

  function clear() {
    setFile(null);
    setPreview([]);
    setStatus('idle');
    setMessage('');
    setUsedEncoding(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const isProcessing = status === 'uploading' || status === 'refreshing';

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
        <div className="p-6 space-y-5">
          {/* 対象月 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm font-semibold text-slate-700 w-28 shrink-0">対象月</label>
            <input
              type="month"
              value={targetMonth ? targetMonth.slice(0, 7) : ''}
              onChange={(e) => { setTargetMonth(e.target.value ? `${e.target.value}-01` : ''); setDetectedMonth(null); }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            />
            {detectedMonth ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                <Zap className="w-3 h-3" />
                CSVから自動検出: {detectedMonth.replace('-', '年')}月
              </span>
            ) : (
              <span className="text-xs text-slate-400">ファイル選択時にCSVから自動検出します</span>
            )}
          </div>

          {/* 文字コード */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-sm font-semibold text-slate-700 w-28 shrink-0">文字コード</label>
            <select
              value={encoding}
              onChange={async (e) => {
                const enc = e.target.value as Encoding;
                setEncoding(enc);
                setStatus('idle');
                setMessage('');
                if (file) {
                  const text = await readFile(file, enc);
                  setPreview(text.split(/\r?\n/).slice(0, 8));
                }
              }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white cursor-pointer"
            >
              <option value="auto">自動判別（推奨）</option>
              <option value="utf-8">UTF-8</option>
              <option value="shift_jis">Shift_JIS（Windows）</option>
            </select>
            {usedEncoding && (
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                判定: {usedEncoding.toUpperCase()}
              </span>
            )}
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
            : file
            ? 'border-emerald-300 bg-emerald-50/30'
            : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        {file ? (
          <div className="space-y-2">
            <FileText className="w-10 h-10 text-emerald-500 mx-auto" />
            <div className="font-semibold text-slate-700">{file.name}</div>
            <div className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB · クリックでファイル変更</div>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="font-semibold text-slate-600">ファイルをドラッグ＆ドロップ</div>
            <div className="text-xs text-slate-400">または、クリックしてファイルを選択</div>
            <div className="text-xs text-slate-400 mt-2">.csv, .tsv, .txt（UTF-8 / Shift_JIS）</div>
          </div>
        )}
      </div>

      {/* アクションボタン */}
      <div className="flex items-center gap-3">
        <button
          onClick={upload}
          disabled={!file || isProcessing}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isProcessing ? '処理中…' : 'アップロードして取り込み'}
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
          {preview.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-4">ファイル未選択</div>
          ) : (
            <pre className="whitespace-pre-wrap text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-4 max-h-[280px] overflow-auto font-mono leading-relaxed">
              {preview.join('\n')}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
