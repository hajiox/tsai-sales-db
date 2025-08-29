// app/finance/general-ledger/import/page.tsx
'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';

export default function GeneralLedgerImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('');

  async function onPick(f: File | null) {
    setFile(f);
    setStatus('');
    setPreview([]);
    if (!f) return;
    const text = await f.text();
    setPreview(text.split(/\r?\n/).slice(0, 8));
  }

  async function upload() {
    if (!file) {
      setStatus('ファイルを選択してください。');
      return;
    }
    try {
      setStatus('取り込み中…');
      const fd = new FormData();
      fd.append('file', file);
      // 原本保存などのオプション（必要に応じて API 側で使用）
      fd.append('options', JSON.stringify({ saveOriginal: true }));

      // 既存 API を想定：/app/api/general-ledger/import/route.ts
      const res = await fetch('/api/general-ledger/import', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? res.statusText);
      setStatus(`完了: ${json?.message ?? '取り込みが完了しました'}`);
    } catch (e: any) {
      setStatus(`失敗: ${String(e?.message ?? e)}`);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        仕訳CSVインポート
      </h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Link href="/finance/general-ledger" style={btn()}>
          ← 月次一覧に戻る
        </Link>
      </div>

      <section style={card()}>
        <div style={{ marginBottom: 8 }}>
          対応拡張子: <code>.csv, .tsv, .txt</code>（UTF-8推奨）
        </div>

        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          style={{ marginBottom: 12 }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={upload} style={btn()}>
            アップロードして取り込み
          </button>
          <button
            onClick={() => {
              setFile(null);
              setPreview([]);
              setStatus('');
            }}
            style={btn()}
          >
            クリア
          </button>
        </div>

        {status && <p style={{ marginTop: 10 }}>{status}</p>}
      </section>

      <section style={{ ...card(), marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          プレビュー（先頭8行）
        </div>
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
    border: '1px solid #eee', // ← 修正済み（クオートミス対策）
    borderRadius: 12,
    background: 'white',
    padding: 14,
  };
}
