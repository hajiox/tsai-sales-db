// app/sales/dashboard/page.tsx (修正後)

// このページを動的にレンダリングするようにNext.jsに指示する
export const dynamic = 'force-dynamic';

// 'use client' はこのファイルでは不要です。
// 子コンポーネントのDashboardViewがクライアントコンポーネントであれば問題ありません。

import DashboardView from '@/components/dashboard-view';

export default function SalesDashboardPage() {
    return (
        <div className="p-4 md:p-6 lg:p-8">
            <DashboardView />
        </div>
    )
}
