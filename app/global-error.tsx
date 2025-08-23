"use client";

/**
 * Root layout 直下で起きるランタイムエラーを捕捉して
 * メッセージとスタックをその場に表示するためのページ。
 * 既存コードは触らず、原因箇所を特定するための一時措置です。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
          アプリでエラーが発生しました
        </h1>

        <div style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          background: "#f6f8fa", border: "1px solid #eaecef", borderRadius: 6, padding: 12, marginBottom: 12 }}>
          <div><strong>name:</strong> {String(error?.name ?? "Error")}</div>
          <div><strong>message:</strong> {String(error?.message ?? "")}</div>
          {error?.digest && <div><strong>digest:</strong> {error.digest}</div>}
          {"stack" in (error ?? {}) && (
            <>
              <div style={{ marginTop: 8, fontWeight: 600 }}>stack:</div>
              <div>{String((error as any).stack ?? "")}</div>
            </>
          )}
        </div>

        <button
          onClick={() => reset()}
          style={{
            padding: "8px 12px",
            border: "1px solid #d0d7de",
            borderRadius: 6,
            background: "#fff",
            cursor: "pointer",
          }}
        >
          再読み込み
        </button>
      </body>
    </html>
  );
}
