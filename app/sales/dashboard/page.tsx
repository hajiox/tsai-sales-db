// app/sales/dashboard/page.tsx (修正後)

// SSGを回避し、CSRへ寄せる（プリレンダー時のhook問題を回避）
export const dynamic = 'force-dynamic';
// Next.jsの仕様上 revalidate は number か false。誤ってオブジェクト化されるのを避けるため false で固定。
export const revalidate = false;
// fetch のキャッシュも無効化しておく（保険）
export const fetchCache = 'force-no-store';

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
