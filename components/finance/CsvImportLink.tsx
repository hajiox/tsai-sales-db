// components/finance/CsvImportLink.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';

/** 仕訳CSVインポート画面へ確実に遷移するリンク */
export default function CsvImportLink({
  children = '仕訳CSVインポート',
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const href = '/finance/general-ledger/import';

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // 親の onClick（カード全体クリック等）の影響を受けず、必ず遷移
    e.stopPropagation();
    e.preventDefault();
    try {
      router.push(href);
    } catch {
      // それでもダメならフォールバック
      window.location.href = href;
    }
  };

  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onClick}
      className={className}
      aria-label="仕訳CSVインポートへ移動"
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
    >
      {children}
    </Link>
  );
}
