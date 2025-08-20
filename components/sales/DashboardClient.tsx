'use client';
import { useEffect, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Hydrated from '@/components/common/Hydrated';

const SalesCharts = dynamic(() => import('@/components/sales/SalesCharts'), { ssr: false });
const DatePickerClient = dynamic(() => import('@/components/common/DatePickerClient'), { ssr: false });

export default function DashboardClient() {
  return (
    <Suspense fallback={null}>
      <Hydrated>
        <Inner />
      </Hydrated>
    </Suspense>
  );
}

function Inner() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  useEffect(() => { setSelectedDate(new Date()); }, []);
  if (!selectedDate) return null;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">統合売上ダッシュボード</h1>
        <DatePickerClient value={selectedDate} onChange={setSelectedDate} />
      </div>
      <div className="mt-6">
        <SalesCharts date={selectedDate} />
      </div>
    </div>
  );
}

