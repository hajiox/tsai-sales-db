// app/layout.tsx ver.2
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import MainDashboard from "@/main-dashboard";
import { Toaster } from "sonner";
import { MobilePwaRegister } from "@/components/mobile-pwa-register";

export const metadata: Metadata = {
  title: "TSA System",
  description: "TSA業務管理システム",
  applicationName: "TSA Mobile",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TSA Mobile",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: "/favicon.ico",
    apple: "/tsa-mobile-icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
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
      <body suppressHydrationWarning>
        <Providers>
          <MobilePwaRegister />
          <MainDashboard>
            {children}
          </MainDashboard>
          <Toaster position="top-center" richColors />
        </Providers>
      </body>
    </html>
  );
}
