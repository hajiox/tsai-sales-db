// app/layout.tsx (minimal + Providers only)
// MainDashboard / Toaster は一旦外して、#130 の原因切り分けを続けます。

import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

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
      <body style={{ margin: 0 }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
