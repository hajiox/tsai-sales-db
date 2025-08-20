// /components/common/Hydrated.tsx ver.1 (2025-08-19 JST)
'use client';
import { useEffect, useState, ReactNode } from 'react';
export default function Hydrated({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return <>{children}</>;
}
