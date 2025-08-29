'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MouseEvent } from 'react';

const PATH = '/finance/general-ledger/import';

/** 仕訳CSVインポート画面へ必ず遷移するリンク（Link + router.push の二重化） */
export default function CsvImportLink() {
  const router = useRouter();

  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    // 親要素の onClick や stopPropagation に殺されても確実に遷移
    e.preventDefault();
    try {
      router.push(PATH);
    } catch {
      // それでもダメなら最終フォールバック
      window.location.href = PATH;
    }
  };

  return (
    <Link
      href={PATH}
      prefetch={false}
      onClick={go}
      aria-label="仕訳CSVインポートへ移動"
      style={{
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
      }}
    >
      仕訳CSVインポート
    </Link>
  );
}
