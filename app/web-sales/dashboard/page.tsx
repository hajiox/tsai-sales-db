// server wrapper for /web-sales/dashboard
export const dynamic = 'force-dynamic'
import NextDynamic from 'next/dynamic'
const DashboardClient = NextDynamic(() => import('./page.client'), { ssr: false })
export default function Page() {
  return <DashboardClient />
}
