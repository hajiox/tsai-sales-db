// /app/sales/dashboard/page.tsx ver.3 (2025-08-20 JST)
"use client";

// ページはSSGしない（ルートの dynamic 設定用）
export const dynamic = 'force-dynamic';
export const revalidate = false;
export const fetchCache = 'force-no-store';
import NextDynamic from 'next/dynamic';

const DashboardClient = NextDynamic(() => import('@/components/sales/DashboardClient'), { ssr: false });

export default function Page() {
  return <DashboardClient />;
}

