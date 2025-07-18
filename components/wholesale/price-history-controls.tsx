// /components/wholesale/price-history-controls.tsx ver.1
"use client"

import { History, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface PriceChangeDate {
  change_date: string;
  product_count: number;
}

interface PriceHistoryControlsProps {
  isHistoricalMode: boolean;
  selectedHistoryDate: string | null;
  loadingHistorical: boolean;
  priceChangeDates: PriceChangeDate[];
  onToggleHistoricalMode: () => void;
  onShowPriceAtDate: (date: string) => void;
}

export default function PriceHistoryControls({
  isHistoricalMode,
  selectedHistoryDate,
  loadingHistorical,
  priceChangeDates,
  onToggleHistoricalMode,
  onShowPriceAtDate,
}: PriceHistoryControlsProps) {
  const router = useRouter();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onToggleHistoricalMode}
        disabled={loadingHistorical}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          isHistoricalMode && !selectedHistoryDate
            ? 'bg-amber-600 text-white hover:bg-amber-700' 
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        } ${loadingHistorical ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <History className="h-4 w-4" />
        {loadingHistorical ? '読み込み中...' : isHistoricalMode && !selectedHistoryDate ? '過去価格表示中' : '過去価格で表示'}
      </button>
      
      {/* 価格変更日付ボタン */}
      {priceChangeDates.map((dateInfo) => (
        <button
          key={dateInfo.change_date}
          onClick={() => onShowPriceAtDate(dateInfo.change_date)}
          disabled={loadingHistorical}
          className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm transition-colors ${
            selectedHistoryDate === dateInfo.change_date
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          } ${loadingHistorical ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={`${dateInfo.product_count}商品の価格変更`}
        >
          <Calendar className="h-3 w-3" />
          {formatDate(dateInfo.change_date)}
        </button>
      ))}
      
      {/* 履歴の管理ボタン */}
      <button
        onClick={() => router.push('/wholesale/price-history')}
        className="flex items-center gap-1 px-3 py-2 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700"
      >
        <History className="h-4 w-4" />
        履歴の管理
      </button>
    </div>
  );
}
