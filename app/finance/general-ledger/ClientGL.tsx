// app/finance/general-ledger/ClientGL.tsx
'use client';

import Link from 'next/link';

export default function ClientGL() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <section
        style={{
          border: '1px solid #eee',
          borderRadius: 12,
          background: 'white',
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          月次データ（インポート）
        </h2>
        <p style={{ color: '#6b7280', marginBottom: 12 }}>
          ※ このページは現在、月次一覧API未実装のため「取り込みの入り口」として動作します。反映状況は
          <Link href="/finance/overview" style={{ textDecoration: 'underline', marginLeft: 4 }}>
            Overview
          </Link>
          で確認してください。
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/finance/general-ledger/import" style={btn()}>
            仕訳CSVインポート
          </Link>
          <Link href="/finance/general-ledger/closing-import" style={btn()}>
            決算仕訳インポート
          </Link>
          <Link href="/finance/overview" style={btn()}>
            Overview を開く
          </Link>
        </div>
      </section>
    </div>
  );
}

function btn(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    border: '1px solid #ddd',
    borderRadius: 10,
    background: '#f9fafb',
    textDecoration: 'none',
    color: '#111',
    fontWeight: 600,
    cursor: 'pointer',
  };
}
