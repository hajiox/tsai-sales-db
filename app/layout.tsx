// app/layout.tsx (minimal, for isolating React #130)
// 元に戻したい場合は、あなたが渡してくれた layout.tsx を再貼り戻しします。

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TSA System",
  description: "Sales Management System",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      {/* Providers / MainDashboard / Toaster を一旦外す */}
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
