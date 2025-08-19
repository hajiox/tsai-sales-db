// /components/sales/SalesCharts.tsx ver.7 (2025-08-19 JST)
// Recharts/Chart.js等を使う想定。ブラウザ専用で描画。

'use client';

import { useEffect, useState } from 'react';
// import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type Props = { date: Date };

export default function SalesCharts({ date }: Props) {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    // フェッチや計算をクライアントで実行（SSRと不一致の元を断つ）
    // setData([...]);
  }, [date]);

  // ResponsiveContainer等はwindowサイズ依存のためクライアントのみ
  return (
    <div className="w-full h-[360px]">
      {/* グラフ本体（既存ロジックを移植） */}
    </div>
  );
}

