// app/finance/general-ledger/page.tsx
import dynamic from 'next/dynamic';
import Link from 'next/link';

const ClientGL = dynamic(() => import('./ClientGL'), { ssr: false });

export default function GeneralLedgerPage() {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: 16 }}>
      {/* 右上のアクションは「仕訳CSV」「決算仕訳」の2つだけ */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <Link href="/finance/general-ledger/import" prefetch={false} style={btn()}>
          仕訳CSVインポート
        </Link>
        <Link href="/finance/general-ledger/closing-import" prefetch={false} style={btn()}>
          決算仕訳インポート
        </Link>
      </div>

      {/* 月次一覧（クライアント側で描画） */}
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
    cursor: 'pointer',
  };
}
