// /app/sales/dashboard/page.tsx ver.21 (2025-08-19 JST)
'use client';

import { useEffect, useState, Suspense } from 'react';
import nextDynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import Hydrated from '@/components/common/Hydrated';
// 必要ならSupabaseを使うが、このページでは未使用ならimport不要
// import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

// SSGを回避し、CSRへ寄せる（プリレンダー時のhook問題を回避）
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// window依存のコンポーネントはSSR無効で
const SalesCharts = nextDynamic(() => import('@/components/sales/SalesCharts'), { ssr: false });
const DatePickerClient = nextDynamic(() => import('@/components/common/DatePickerClient'), { ssr: false });

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Hydrated>
        <SalesDashboardInner />
      </Hydrated>
    </Suspense>
  );
}

function SalesDashboardInner() {
  const params = useSearchParams(); // Suspense内で呼ばれる
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // URLの ?date=YYYY-MM-DD を解釈。無ければクライアント側でtodayに確定
  useEffect(() => {
    const q = params?.get('date');
    setSelectedDate(q ? new Date(q) : new Date());
  }, [params]);

  if (!selectedDate) return null; // ハイドレーション完了まで描画を遅延

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">統合売上ダッシュボード</h1>
        <DatePickerClient value={selectedDate} onChange={setSelectedDate} />
      </div>
      {/* 既存のKPIカード群はそのまま */}
      <div className="mt-6">
        <SalesCharts date={selectedDate} />
      </div>
    </div>
  );
}
