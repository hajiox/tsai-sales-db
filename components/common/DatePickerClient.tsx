// /components/common/DatePickerClient.tsx ver.1 (2025-08-19 JST)
'use client';
import { useMemo } from 'react';

type Props = { value: Date; onChange: (d: Date) => void; className?: string };

function fmt(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DatePickerClient({ value, onChange, className }: Props) {
  const v = useMemo(() => fmt(value), [value]);
  return (
    <input
      type="date"
      className={className}
      value={v}
      onChange={(e) => {
        const [y, m, d] = e.target.value.split('-').map(Number);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) onChange(new Date(y, m - 1, d));
      }}
    />
  );
}

