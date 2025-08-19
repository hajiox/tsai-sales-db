// /components/common/DatePickerClient.tsx ver.1 (2025-08-19 JST)
// シンプルな日付ピッカー。クライアント専用。

'use client';

import { useState, useEffect } from 'react';

type Props = { value: Date; onChange: (date: Date) => void };

export default function DatePickerClient({ value, onChange }: Props) {
  const [internal, setInternal] = useState('');

  useEffect(() => {
    setInternal(value.toISOString().split('T')[0]);
  }, [value]);

  return (
    <input
      type="date"
      value={internal}
      onChange={(e) => {
        const d = new Date(e.target.value);
        if (!isNaN(d.getTime())) {
          setInternal(e.target.value);
          onChange(d);
        }
      }}
      className="border rounded p-2"
    />
  );
}

