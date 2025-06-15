// app/layout.tsx (最終確認用)

import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import MainDashboard from "@/main-dashboard";

export const metadata: Metadata = {
  title: "TSA System",
  description: "Sales Management System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <Providers>
          <MainDashboard>
            {children}
          </MainDashboard>
        </Providers>
      </body>
    </html>
  );
}
