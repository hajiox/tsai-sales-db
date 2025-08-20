'use client';
import { useEffect, useState } from 'react';

type Props = { timeZone?: string };
export default function ClientDate({ timeZone = 'Asia/Tokyo' }: Props) {
  const [text, setText] = useState('');
  useEffect(() => {
    const d = new Date();
    const y = new Intl.DateTimeFormat('ja-JP', { timeZone, year: 'numeric' }).format(d);
    const m = new Intl.DateTimeFormat('ja-JP', { timeZone, month: '2-digit' }).format(d);
    const day = new Intl.DateTimeFormat('ja-JP', { timeZone, day: '2-digit' }).format(d);
    setText(`${y}.${m}.${day}`);
  }, [timeZone]);
  return <span>{text}</span>;
}

