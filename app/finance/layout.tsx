// app/finance/layout.tsx
import Link from 'next/link';
import type { ReactNode } from 'react';

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: 16 }}>
      {/* Top Navigation */}
      <nav
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          padding: 12,
          border: '1px solid #eee',
          borderRadius: 12,
          background: 'white',
          marginBottom: 16,
        }}
      >
        {/* NOTE:
            404回避のため Home は実在ページへ（/finance/overview） */}
        <LinkButton href="/finance/overview">Home</LinkButton>
        <LinkButton href="/finance/overview">Overview</LinkButton>
        <LinkButton href="/finance/bs">B/S 明細</LinkButton>
        <LinkButton href="/finance/pl">P/L 明細</LinkButton>
        <LinkButton href="/finance/series">推移グラフ</LinkButton>
      </nav>

      <main>{children}</main>
    </div>
  );
}

function LinkButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: '8px 12px',
        border: '1px solid #ddd',
        borderRadius: 8,
        textDecoration: 'none',
        color: '#111',
        background: '#f9fafb',
      }}
    >
      {children}
    </Link>
  );
}
