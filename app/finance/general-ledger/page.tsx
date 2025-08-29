// app/finance/general-ledger/page.tsx
'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';

const ClientGL = dynamic(() => import('./ClientGL'), { ssr: false });

/** 決め打ち遷移リンク（フォールバック用のみで使用） */
function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
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
      style={btn()}
    >
      {children}
    </a>
  );
}

/** ClientGL の例外を握り、フォールバックUI（ボタンはここでのみ1セット表示） */
class GLBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
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
            {/* フォールバック時だけ出す（1個ずつ） */}
            <ActionLink href="/finance/general-ledger/import">仕訳CSVインポート</ActionLink>
            <ActionLink href="/finance/general-ledger/closing-import">決算仕訳インポート</ActionLink>
            <Link href="/finance/overview" style={btn()}>
              Overview へ戻る
            </Link>
          </div>
          <div style={alert()}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              月次一覧の表示中にエラーが発生しました。
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              右上の「仕訳CSVインポート」「決算仕訳インポート」から取り込みは続行できます。表示の復旧はこの後対応します。
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
      {/* 通常時は ClientGL 側のボタンのみ。エラー時は上のフォールバックに2ボタンを表示 */}
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
    cursor: 'pointer',
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
