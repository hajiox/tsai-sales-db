import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import MainDashboard from "@/main-dashboard";
import { Toaster } from "@/components/ui/sonner"; // ★ sonnerからToasterをインポート

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
          <Toaster richColors /> {/* ★ この行を追加 */}
        </Providers>
      </body>
    </html>
  );
}
