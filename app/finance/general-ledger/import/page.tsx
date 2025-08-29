// app/finance/general-ledger/import/page.tsx
'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';

type Encoding = 'auto' | 'utf-8' | 'shift_jis';

export default function GeneralLedgerImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('');
  const [targetMonth, setTargetMonth] = useState<string>(''); // "YYYY-MM-01"
  const [encoding, setEncoding] = useState<Encoding>('auto'); // 文字コード選択
  const [usedEncoding, setUsedEncoding] = useState<Exclude<Encoding, 'auto'> | null>(null); // 実際に使用したエンコーディング

  // ---------- helpers ----------
  function countReplacementChars(s: string) {
    // U+FFFD の個数（文字化け指標）
    return (s.match(/\uFFFD/g) || []).length;
  }

  function decodeBuffer(buf: ArrayBuffer, enc: Exclude<Encoding, 'auto'>) {
    // TextDecoder は 'shift_jis' をサポート（Windows-31J エイリアス）
    const dec = new TextDecoder(enc, { fatal: false });
    return dec.decode(buf);
  }

  function autoDecode(buf: ArrayBuffer): { text: string; used: Exclude<Encoding, 'auto'> } {
    const utf8 = decodeBuffer(buf, 'utf-8');
    const sjis = decodeBuffer(buf, 'shift_jis');

    // 置換文字が少ない方を採用。完全同数なら UTF-8 を優先
    const r1 = countReplacementChars(utf8);
    const r2 = countReplacementChars(sjis);
    if (r2 < r1) return { text: sjis, used: 'shift_jis' };
    return { text: utf8, used: 'utf-8' };
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

  // ---------- handlers ----------
  async function onPick(f: File | null) {
    setFile(f);
    setStatus('');
    setPreview([]);
    setUsedEncoding(null);
    if (!f) return;
    const text = await readFile(f, encoding);
    setPreview(text.split(/\r?\n/).slice(0, 8));
  }

  async function upload() {
    if (!file) {
      setStatus('ファイルを選択してください。');
      return;
    }
    try {
      setStatus('取り込み中…');

      // 送信直前に、ユーザーの選択（または自動判定）で再デコードしてAPIへ渡す
      const buf = await file.arrayBuffer();
      const encToUse = encoding === 'auto' ? (usedEncoding ?? 'utf-8') : encoding;
      const text = encToUse === 'utf-8' ? decodeBuffer(buf, 'utf-8') : decodeBuffer(buf, 'shift_jis');

      const fd = new FormData();
      // サーバー側で text/csv を受け取りたいケースもあるので Blob を作り直す
      fd.append('file', new Blob([text], { type: 'text/plain;charset=utf-8' }), file.name.replace(/\.(txt|csv|tsv)$/i, '') + '.csv');

      // API側オプション
      const options = {
        saveOriginal: true,
        targetMonth: targetMonth || undefined,         // "YYYY-MM-01"
        encoding: encToUse,                             // 'utf-8' | 'shift_jis'
      };
      fd.append('options', JSON.stringify(options));

      const res = await fetch('/api/general-ledger/import', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? res.statusText);

      setStatus(`完了: ${json?.message ?? '取り込みが完了しました'}`);
    } catch (e: any) {
      setStatus(`失敗: ${String(e?.message ?? e)}`);
    }
  }

  // ---------- UI ----------
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>仕訳CSVインポート</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Link href="/finance/general-ledger" style={btn()}>← 月次一覧に戻る</Link>
      </div>

      <section style={card()}>
        {/* 対象月 */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600 }}>対象月（任意）</label>
          <input
            type="month"
            value={targetMonth ? targetMonth.slice(0, 7) : ''}
            onChange={(e) => setTargetMonth(e.target.value ? `${e.target.value}-01` : '')}
            style={{ padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
          />
          <span style={{ color: '#6b7280' }}>※ CSVに日付が無い/壊れている場合、この年月を既定値として用います</span>
        </div>

        {/* 文字コード */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600 }}>文字コード</label>
          <select
            value={encoding}
            onChange={async (e) => {
              const enc = e.target.value as Encoding;
              setEncoding(enc);
              setStatus('');
              // すでに選ばれているファイルがあれば、プレビューをその場で再デコード
              if (file) {
                const text = await readFile(file, enc);
                setPreview(text.split(/\r?\n/).slice(0, 8));
              }
            }}
            style={{ padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
          >
            <option value="auto">自動判別（推奨）</option>
            <option value="utf-8">UTF-8</option>
            <option value="shift_jis">Shift_JIS（Windows）</option>
          </select>
          {usedEncoding && <span style={{ color: '#6b7280' }}>判定結果: {usedEncoding.toUpperCase()}</span>}
        </div>

        <div style={{ marginBottom: 8 }}>
          対応拡張子: <code>.csv, .tsv, .txt</code>（UTF-8 / Shift_JIS）
        </div>

        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          style={{ marginBottom: 12 }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={upload} style={btn()}>アップロードして取り込み</button>
          <button onClick={() => { setFile(null); setPreview([]); setStatus(''); setUsedEncoding(null); }} style={btn()}>
            クリア
          </button>
        </div>

        {status && <p style={{ marginTop: 10 }}>{status}</p>}
      </section>

      <section style={{ ...card(), marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>プレビュー（先頭8行）</div>
        {preview.length === 0 ? (
          <div style={{ color: '#6b7280' }}>ファイル未選択</div>
        ) : (
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              padding: 12,
              border: '1px solid #eee',
              borderRadius: 8,
              background: '#fafafa',
              maxHeight: 280,
              overflow: 'auto',
            }}
          >
{preview.join('\n')}
          </pre>
        )}
      </section>
    </div>
  );
}

function btn(): CSSProperties {
  return {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 8,
    background: '#f9fafb',
    color: '#111',
    textDecoration: 'none',
    cursor: 'pointer',
    fontWeight: 600,
  };
}

function card(): CSSProperties {
  return {
    border: '1px solid #eee',
    borderRadius: 12,
    background: 'white',
    padding: 14,
  };
}
