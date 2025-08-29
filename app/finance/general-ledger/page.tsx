// app/finance/general-ledger/page.tsx
'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 従来のクライアント実装をそのまま読み込み
const ClientGL = dynamic(() => import('./ClientGL'), { ssr: false });

export default function GeneralLedgerPage() {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: 16 }}>
      {/* 仕訳CSVインポートの遷移を強制的に修正するパッチ（画面に何も追加しない） */}
      <FixImportButton />
      <ClientGL />
    </div>
  );
}

/**
 * 画面内の「仕訳CSVインポート」ボタン/リンクのクリックをフックし、
 * 必ず /finance/general-ledger/import へ遷移させる。
 * - キャプチャ段階でイベントを奪うため、親の onClick/stopPropagation の影響を受けない
 * - <a> でも <button> でも動作
 */
function FixImportButton() {
  const router = useRouter();

  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;

      // クリック元から一番近い a / button を取得
      const el = t.closest('a,button') as HTMLElement | null;
      if (!el) return;

      const text = (el.textContent || '').trim();
      if (!text) return;

      // ラベルに「仕訳CSVインポート」を含む要素のみを対象にする
      if (text.includes('仕訳CSVインポート')) {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          router.push('/finance/general-ledger/import');
        } catch {
          // 何かあっても最終フォールバックで遷移
          window.location.href = '/finance/general-ledger/import';
        }
      }
    };

    // キャプチャ段階でフックして親のハンドラより先に処理する
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [router]);

  return null;
}
