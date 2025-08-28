// components/finance/CsvImportButton.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MouseEvent } from 'react';

const PATH = '/finance/general-ledger/import';

/**
 * 仕訳CSVインポートへ必ず遷移するボタン。
 * - Linkの絶対パス遷移（prefetch無効）
 * - onClickでrouter.pushの二重化（親のevent.stopPropagation等でLinkが殺されても遷移）
 */
export default function CsvImportButton() {
  const router = useRouter();

  const go = (e: MouseEvent) => {
    try {
      // 何かに阻害されても最終的にpushで遷移
      e.preventDefault();
      router.push(PATH);
    } catch {
      // それでもダメな場合の最終フォールバック
      window.location.href = PATH;
    }
  };

  return (
    <Link
      href={PATH}
      prefetch={false}
      onClick={go}
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
      }}
      aria-label="仕訳CSVインポートへ移動"
    >
      <span style={{ fontWeight: 600 }}>仕訳CSVインポート</span>
    </Link>
  );
}
