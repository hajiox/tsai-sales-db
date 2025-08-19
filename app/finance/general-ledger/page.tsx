// ver.23 (2025-08-19 JST) - split to ClientGL; avoid SSR and prerender
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

import nextDynamic from 'next/dynamic';
const ClientGL = nextDynamic(() => import('./ClientGL'), { ssr: false });

export default function Page() {
  return <ClientGL />;
}
