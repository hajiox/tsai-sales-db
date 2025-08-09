// /app/rcm/import/page.tsx ver.1
"use client";

import { useState } from "react";

export default function RcmImportPage() {
  const [objectName, setObjectName] = useState("");
  const [truncate, setTruncate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function runImport(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/rcm/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectName, truncate }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setResult(json);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">RCM インポート実行</h1>

      <form onSubmit={runImport} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Storage ファイル名（rcm-imports バケット）
          </label>
          <input
            type="text"
            placeholder="例）rcm-2025-08-09-net.xlsx"
            value={objectName}
            onChange={(e) => setObjectName(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={truncate}
            onChange={(e) => setTruncate(e.target.checked)}
          />
          <span className="text-sm">
            取込前に対象テーブル（各シート）の既存行を消去（ベストエフォート）
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !objectName}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {loading ? "実行中…" : "インポート実行"}
          </button>
          <span className="text-sm text-gray-600">
            エンドポイント：<code>/api/rcm/import</code>
          </span>
        </div>
      </form>

      {/* 結果表示 */}
      {error && (
        <div className="mt-6 p-4 border border-red-300 bg-red-50 text-red-700 rounded">
          <div className="font-semibold">エラー</div>
          <div className="mt-1 text-sm whitespace-pre-wrap break-all">{error}</div>
        </div>
      )}

      {result && (
        <div className="mt-6 p-4 border rounded bg-gray-50">
          <div className="font-semibold mb-2">結果</div>
          <pre className="text-sm whitespace-pre-wrap break-all">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      <hr className="my-8" />
      <section className="text-sm text-gray-700 space-y-2">
        <p className="font-semibold">使い方</p>
        <ol className="list-decimal ml-5 space-y-1">
          <li>Supabase Storage の <code>rcm-imports</code> にファイルをアップ。</li>
          <li>このページにその「ファイル名」を入力。</li>
          <li>必要に応じて「消去してから取込」をチェック。</li>
          <li>「インポート実行」をクリック。</li>
        </ol>
      </section>
    </main>
  );
}
