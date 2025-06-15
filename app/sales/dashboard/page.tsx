// app/sales/dashboard/page.tsx (認証解除テスト用)

"use client"

import DashboardView from '@/components/dashboard-view' // パスが正しいか確認

export default function SalesDashboardPage() {
    return (
        <div className="p-4 md:p-6 lg:p-8">
            <DashboardView />
        </div>
    )
}
