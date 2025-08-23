// /app/layout.tsx ver.1-fixA （MainDashboardのみ復帰・Toaster保留）

import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import MainDashboard from "@/main-dashboard"; // ←元と同じパス

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
      <body>
        <Providers>
          <MainDashboard>
            {children}
          </MainDashboard>
          {/* Toaster は一旦外したまま */}
        </Providers>
      </body>
    </html>
  );
}
