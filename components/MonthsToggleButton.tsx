// /components/MonthsToggleButton.tsx ver.1
'use client';

import { useState, useEffect } from 'react';

interface MonthsToggleButtonProps {
  onToggle: (months: number) => void;
  initialMonths?: number;
  className?: string;
}

export default function MonthsToggleButton({
  onToggle,
  initialMonths = 6,
  className = ''
}: MonthsToggleButtonProps) {
  const [monthsToShow, setMonthsToShow] = useState(initialMonths);

  useEffect(() => {
    // 初期値を親コンポーネントに通知
    onToggle(initialMonths);
  }, [initialMonths, onToggle]);

  const handleToggle = () => {
    const newMonthsToShow = monthsToShow === 6 ? 12 : 6;
    setMonthsToShow(newMonthsToShow);
    onToggle(newMonthsToShow);
  };

  return (
    <button
      onClick={handleToggle}
      className={`px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 transition-colors flex items-center ${className}`}
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-4 w-4 mr-1" 
        viewBox="0 0 20 20" 
        fill="currentColor"
      >
        <path 
          fillRule="evenodd" 
          d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" 
          clipRule="evenodd" 
        />
      </svg>
      {monthsToShow === 6 ? '12ヶ月表示' : '6ヶ月表示に戻す'}
    </button>
  );
}
