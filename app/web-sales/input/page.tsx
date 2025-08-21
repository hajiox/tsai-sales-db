// server wrapper for /web-sales/input
export const dynamic = 'force-dynamic'
import NextDynamic from 'next/dynamic'
const InputClient = NextDynamic(() => import('./page.client'), { ssr: false })
export default function Page() {
  return <InputClient />
}
