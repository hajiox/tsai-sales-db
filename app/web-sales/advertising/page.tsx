// /app/web-sales/advertising/page.tsx
import { Suspense } from 'react'
import AdvertisingDashboard from './page.client'

// ビルド時の静的レンダリングを回避
export const dynamic = 'force-dynamic'

function AdvertisingLoading() {
    return (
        <div className="w-full space-y-6">
            <div className="animate-pulse space-y-4">
                <div className="h-8 bg-gray-200 rounded w-1/3"></div>
                <div className="grid grid-cols-4 gap-4">
                    {[0, 1, 2, 3].map(i => <div key={i} className="h-28 bg-gray-200 rounded-lg"></div>)}
                </div>
                <div className="h-64 bg-gray-200 rounded-lg"></div>
            </div>
        </div>
    )
}

export default function AdvertisingPage() {
    return (
        <Suspense fallback={<AdvertisingLoading />}>
            <AdvertisingDashboard />
        </Suspense>
    )
}
