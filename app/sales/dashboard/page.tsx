// /app/sales/dashboard/page.tsx ver.21 (2025-08-19 JST)
// 売上ダッシュボード：クライアント専用化、SSR依存を排除、チャートをSSR無効で読み込み

'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

// グラフやwindow依存コンポーネントはSSR無効で読み込む
const SalesCharts = dynamic(() => import('@/components/sales/SalesCharts'), { ssr: false });
const DatePickerClient = dynamic(() => import('@/components/common/DatePickerClient'), { ssr: false });

function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}

export default function SalesDashboardPage() {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const supabase = getSupabaseBrowserClient();

  // 日付はSSRでズレるため、クライアント側で確定
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  useEffect(() => {
    const q = params?.get('date');
    setSelectedDate(q ? new Date(q) : new Date());
  }, [params]);

  // ここで必要なデータフェッチ（例）
  // useEffect(() => { (async () => { await supabase.from('...') ... })() }, [selectedDate, supabase]);

  // ハイドレーション前は描画を遅延（#425/#418対策）
  if (!hydrated || !selectedDate) return null;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">統合売上ダッシュボード</h1>
        <Suspense fallback={null}>
          <DatePickerClient value={selectedDate} onChange={setSelectedDate} />
        </Suspense>
      </div>

      {/* KPIカード群（既存UIをそのまま移植） */}

      <div className="mt-6">
        <SalesCharts date={selectedDate} />
      </div>
    </div>
  );
}

