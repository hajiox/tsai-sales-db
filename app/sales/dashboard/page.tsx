// app/sales/dashboard/page.tsx (修正後)

// このページを動的にレンダリングするようにNext.jsに指示する
export const dynamic = 'force-dynamic';

// 'use client' はこのファイルでは不要です。
// 子コンポーネントのDashboardViewがクライアントコンポーネントであれば問題ありません。

import DashboardView from '@/components/dashboard-view';

export default function SalesDashboardPage() {
    const todayParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
        todayParts.find((part) => part.type === type)?.value ?? '';
    const initialDate = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;

    return (
        <div className="p-4 md:p-6 lg:p-8">
            <DashboardView initialDate={initialDate} />
        </div>
    )
}
