// /app/finance/general-ledger/page.tsx ver.6 - サブメニュー追加版
'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { FileSpreadsheet, Upload, Calendar, Trash2, BarChart3 } from 'lucide-react';
import GeneralLedgerImportModal from '@/components/general-ledger/GeneralLedgerImportModal';

// ... 既存のインターフェース定義 ...

export default function GeneralLedgerPage() {
  const router = useRouter();
  const pathname = usePathname();
  // ... 既存のstate定義 ...

  // ... 既存の関数定義 ...

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">財務分析システム</h1>
        <p className="text-gray-600">会計データの管理と財務分析</p>
      </div>

      {/* サブメニュー */}
      <div className="bg-gray-50 rounded-lg p-1 mb-6">
        <nav className="flex space-x-1">
          <button
            onClick={() => router.push('/finance/general-ledger')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              pathname === '/finance/general-ledger'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>総勘定元帳</span>
          </button>
          <button
            onClick={() => router.push('/finance/financial-statements')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              pathname === '/finance/financial-statements'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>財務諸表</span>
          </button>
        </nav>
      </div>

      {/* 以下、既存のコンテンツをそのまま維持 */}
      {/* コントロールパネル、月次サマリーテーブル、インポートモーダルなど */}
    </div>
  );
}
