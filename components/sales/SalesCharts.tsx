// /components/sales/SalesCharts.tsx ver.1 (2025-08-19 JST)
'use client';
type Props = { date: Date };
export default function SalesCharts({ date }: Props) {
  // プレースホルダー：まずビルドを通す。後で本実装を移植。
  return (
    <div className="w-full h-[360px] rounded-xl border border-dashed p-4">
      <div className="text-sm opacity-70">
        Charts placeholder — {date.toISOString().slice(0, 10)}
      </div>
    </div>
  );
}

