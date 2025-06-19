// /app/api-test/page.tsx
'use client';

import { useState } from 'react';

export default function ApiTestPage() {
  // APIからの応答を保存するための状態
  const [response, setResponse] = useState<any>(null);
  // 読み込み中かどうかを管理するための状態
  const [loading, setLoading] = useState(false);
  // エラーメッセージを保存するための状態
  const [error, setError] = useState<string | null>(null);

  // APIを呼び出す関数
  const testApi = async (period: number) => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch('/api/web-sales-period', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // APIに送信するデータ
        body: JSON.stringify({
          base_month: '2025-06', // 基準月（引き継ぎメモにあった月）
          period_months: period,    // テストしたい期間（6ヶ月 or 12ヶ月）
        }),
      });

      if (!res.ok) {
        throw new Error(`APIエラーが発生しました: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      setResponse(data); // 成功したら結果を保存

    } catch (err: any) {
      setError(err.message); // エラーが発生したらメッセージを保存
    } finally {
      setLoading(false); // ローディング終了
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>期間集計API テストページ</h1>
      <p>
        このページは、<code>/api/web-sales-period</code> の動作確認用です。
      </p>
      
      {/* テスト実行ボタン */}
      <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0' }}>
        <button onClick={() => testApi(6)} disabled={loading}>
          {loading ? 'テスト中...' : '過去6ヶ月でテスト'}
        </button>
        <button onClick={() => testApi(12)} disabled={loading}>
          {loading ? 'テスト中...' : '過去12ヶ月でテスト'}
        </button>
      </div>

      {/* 結果表示エリア */}
      {loading && <p>データを取得しています...</p>}
      {error && <div style={{ color: 'red' }}><p>エラー:</p><pre>{error}</pre></div>}
      {response && (
        <div>
          <h2>APIからの応答結果:</h2>
          <pre style={{ background: '#f0f0f0', padding: '1rem', borderRadius: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
