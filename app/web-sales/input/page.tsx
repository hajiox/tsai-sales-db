'use client';
// client wrapper for /web-sales/input
import NextDynamic from 'next/dynamic'
const InputClient = NextDynamic(() => import('./page.client'), { ssr: false })
export default function Page() {
  return <InputClient />
}
