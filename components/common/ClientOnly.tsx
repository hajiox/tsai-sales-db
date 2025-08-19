'use client';
// ver.1 (2025-08-19 JST)
import { useEffect, useState } from 'react';
export default function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <>{children}</>;
}
