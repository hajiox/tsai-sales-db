// ver.2 (2025-08-19 JST) - split to ClientGLDetail; avoid SSR and prerender
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

import nextDynamic from 'next/dynamic';
const ClientGLDetail = nextDynamic(() => import('./ClientGLDetail'), { ssr: false });

export default function Page() {
  return <ClientGLDetail />;
}
