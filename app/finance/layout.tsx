// app/finance/layout.tsx ver.3
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "財務分析システム",
  description: "財務データの分析と可視化",
};

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* 旧ナビゲーションバーを削除しました。
        サイドバーは親レイアウトで管理されているため、
        ここはコンテンツ領域のラッパーのみとなります。
      */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto">
        {children}
      </main>
    </div>
  );
}
