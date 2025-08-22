'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import dynamicImport from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import getSupabaseBrowserClient from '@/lib/supabase/browser';

// このページはSSGさせずCSRに寄せる（プリレンダー中のhook起因クラッシュを防止）
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SalesCharts = dynamicImport(() => import('@/components/sales/SalesCharts'), { ssr: false });
const DatePickerClient = dynamicImport(() => import('@/components/common/DatePickerClient'), { ssr: false });

// useSearchParams を使うコンポーネントは必ず Suspense 配下に置く
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SalesDashboardInner />
    </Suspense>
  );
}

function SalesDashboardInner() {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const supabase = getSupabaseBrowserClient();

  const initialDate = useMemo(() => {
    const date = params.get('date');
    return date ? new Date(date) : new Date();
  }, [params]);

  const [selectedDate, setSelectedDate] = useState(initialDate);

  useEffect(() => {
    const paramDate = params.get('date');
    if (paramDate) {
      setSelectedDate(new Date(paramDate));
    }
  }, [params]);

  if (!hydrated) return null;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">統合売上ダッシュボード</h1>
        <DatePickerClient value={selectedDate} onChange={setSelectedDate} />
      </div>

      <SalesCharts supabase={supabase} date={selectedDate} />
    </div>
  );
}

function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}
