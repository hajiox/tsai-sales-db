// ClientGL.tsx の先頭（import群の下）に追加
'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';

function CsvImportLink() {
  const router = useRouter();
  const href = '/finance/general-ledger/import';
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // 親の onClick に殺されないように防御して確実に遷移
    e.stopPropagation();
    e.preventDefault();
    try {
      router.push(href);
    } catch {
      window.location.href = href;
    }
  };
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onClick}
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
    </Link>
  );
}
