export default function ReviewStars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-sm text-slate-500">評価なし</span>;
  const value = Math.max(0, Math.min(5, rating));
  return (
    <span role="img" aria-label={`5点満点中${value}点`} className="inline-flex shrink-0 gap-0.5 text-lg leading-none">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} aria-hidden="true" className="relative text-slate-200">
          ★
          <span className="absolute inset-y-0 left-0 overflow-hidden text-amber-500" style={{ width: `${Math.max(0, Math.min(1, value - index)) * 100}%` }}>★</span>
        </span>
      ))}
    </span>
  );
}
