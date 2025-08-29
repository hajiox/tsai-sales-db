// app/finance/general-ledger/closing-import/page.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type CSSProperties } from 'react';

type Encoding = 'auto' | 'utf-8' | 'shift_jis';

export default function ClosingImportPage() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('');
  const [targetMonth, setTargetMonth] = useState<string>(''); // "YYYY-MM-01"
  const [encoding, setEncoding] = useState<Encoding>('auto');
  const [usedEncoding, setUsedEncoding] = useState<Exclude<Encoding, 'auto'> | null>(null);

  // ---------- helpers ----------
  function countReplacementChars(s: string) {
    return (s.match(/\uFFFD/g) || []).length;
  }
  function decodeBuffer(buf: ArrayBuffer, enc: Exclude<Encoding, 'auto'>) {
    const dec = new TextDecoder(enc, { fatal: false });
    return dec.decode(buf);
  }
  function autoDecode(buf: ArrayBuffer): { text: string; used: Exclude<Encoding, 'auto'> } {
    const utf8 = decodeBuffer(buf, 'utf-8');
    const sjis = decodeBuffer(buf, 'shift_jis');
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

      // 再デコードして text を送る（Shift_JISにも対応）
      const buf = await file.arrayBuffer();
      const encToUse = encoding === 'auto' ? (usedEncoding ?? 'utf-8') : encoding;
      const text =
        encToUse === 'utf-8' ? decodeBuffer(buf, 'utf-8') : decodeBuffer(buf, 'shift_jis');

      const fd = new FormData();
      fd.append(
        'file',
        new Blob([text], { type: 'text/plain;charset=utf-8' }),
        file.name.replace(/\.(txt|csv|tsv)$/i, '') + '.csv'
      );
      fd.append(
        'options',
        JSON.stringify({
          kind: 'closing',           // 決算仕訳であることを明示
          saveOriginal: true,
          targetMonth: targetMonth || undefined, // "YYYY-MM-01"
          encoding: encToUse,        // 'utf-8' | 'shift_jis'
        })
      );

      // 1) 決算仕訳のAPIへ。なければ通常インポートAPIをフォールバックで試行
      const candidates = [
        '/api/general-ledger/closing-import',
        '/api/general-ledger/import?type=closing',
      ];
      let ok = false;
      let lastError = '';
      for (const url of candidates) {
        const res = await fetch(url, { method: 'POST', body: fd });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          ok = true;
          break;
        }
        lastError = json?.error ?? `${res.status} ${res.statusText}`;
      }
      if (!ok) throw new Error(lastError || 'インポートに失敗しました');

      // 2) マテビュー更新
      setStatus('取り込み完了 → マテビュー更新中…');
      const r2 = await fetch('/api/finance/refresh', { method: 'POST' });
      if (!r2.ok) throw new Error('マテビュー更新に失敗しました');

      setStatus('完了: 決算仕訳の取り込み＋マテビュー更新 OK。');
    } catch (e: any) {
      setStatus(`失敗: ${String(e?.message ?? e)}`);
      return;
    }
  }

  // ---------- UI ----------
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>決算仕訳インポート</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Link href="/finance/general-ledger" style={btn()}>← 月次一覧に戻る</Link>
      </div>

      <section style={card()}>
        {/* 対象月（決算仕訳を計上する月・任意） */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600 }}>対象月（任意）</label>
          <input
            type="month"
            value={targetMonth ? targetMonth.slice(0, 7) : ''}
            onChange={(e) => setTargetMonth(e.target.value ? `${e.target.value}-01` : '')}
            style={{ padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
          />
          <span style={{ color: '#6b7280' }}>
            ※ CSVに日付が無い/壊れている場合、この年月を既定値として用います
          </span>
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
