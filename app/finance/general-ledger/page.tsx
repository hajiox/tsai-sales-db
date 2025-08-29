// app/finance/general-ledger/page.tsx
import dynamic from 'next/dynamic';
import Link from 'next/link';

const ClientGL = dynamic(() => import('./ClientGL'), { ssr: false });

export default function GeneralLedgerPage() {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: 16 }}>
      {/* アクションバー（サーバー側で描画：確実に遷移） */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <Link href="/finance/general-ledger/import" prefetch={false} style={btn()}>
          📤 仕訳CSVインポート
        </Link>
        <Link href="/finance/general-ledger/closing-import" prefetch={false} style={btn()}>
          🧾 決算仕訳インポート
        </Link>
      </div>

      {/* 以降は従来のクライアント実装 */}
      <ClientGL />
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
  };
}
