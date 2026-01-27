'use client';
// client wrapper for /web-sales/dashboard
import NextDynamic from 'next/dynamic'
const DashboardClient = NextDynamic(() => import('./page.client'), { ssr: false })
export default function Page() {
  return <DashboardClient />
}
