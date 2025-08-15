// /app/finance/financial-statements/page.tsx ver.8
'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const FinancialStatementsContent = dynamic(
  () => import('@/components/finance/FinancialStatementsContent'),
  { 
    ssr: false,
    loading: () => (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }
);

export default function FinancialStatementsPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    }>
      <FinancialStatementsContent />
    </Suspense>
  );
}
