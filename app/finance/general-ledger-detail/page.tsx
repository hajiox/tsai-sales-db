'use client';
// ver.3 (2026-01-27) - Client Component for Next.js 16 compatibility
import nextDynamic from 'next/dynamic';
const ClientGLDetail = nextDynamic(() => import('./ClientGLDetail'), { ssr: false });

export default function Page() {
  return <ClientGLDetail />;
}
