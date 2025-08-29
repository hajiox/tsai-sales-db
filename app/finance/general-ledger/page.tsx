// app/finance/general-ledger/page.tsx
'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';

// もとの月次一覧（ClientGL）はそのまま動的ロード
const ClientGL = dynamic(() => import('./ClientGL'), { ssr: false });

/** どんな時でも /finance/general-ledger/import へ飛ばせるリンク */
function CsvImportLink() {
  const router = useRouter();
  const href = '/finance/general-ledger/import';
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        try {
          router.push(href);
        } catch {
          window.location.href = href;
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        border: '1px solid #ddd',
        borderRadius: 10,
        background: '#f9fafb',
        color: '#111',
        textDecoration: 'none',
        fontWeight: 600,
        cursor: 'pointer',
      }}
      aria-label="仕訳CSVインポートへ移動"
    >
      仕訳CSVインポート
    </a>
  );
}

/** 例外を飲み込み、フォールバックUIを表示する Error Boundary */
class GLBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, message: String(err) };
  }
  componentDidCatch() {
    // ここでログ送信など可能
  }
  render() {
    if (this.state.hasError) {
      // フォールバック：最低限インポート画面へは行ける
      return (
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <CsvImportLink />
            <Link href="/finance/overview" style={btn()}>
              Overview へ戻る
            </Link>
          </div>

          <div style={alert()}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>月次一覧の表示中にエラーが発生しました。</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              右上の「仕訳CSVインポート」から取り込みは続行できます。表示の復旧はこの後対応します。
            </div>
          </div>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}

export default function GeneralLedgerPage() {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: 16 }}>
      {/* 右上に常設のインポート導線（ClientGLが壊れていても使える） */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <CsvImportLink />
      </div>

      {/* ClientGL のエラーはここで握りつぶしてフォールバックに切り替え */}
      <GLBoundary>
        <Suspense fallback={<div style={{ padding: 8 }}>読み込み中…</div>}>
          <ClientGL />
        </Suspense>
      </GLBoundary>
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

function alert(): React.CSSProperties {
  return {
    border: '1px solid #fde68a',
    background: '#fffbeb',
    color: '#78350f',
    borderRadius: 12,
    padding: 14,
  };
}
