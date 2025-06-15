// components/dashboard-stats.tsx

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const StatCard = ({ title, value, isLoading }: { title: string, value: string, isLoading: boolean }) => (
    <Card className="shadow-sm border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">{title}</CardTitle>
        </CardHeader>
        <CardContent>
            {isLoading ? <div className="h-7 bg-slate-200 rounded animate-pulse w-3/4"></div> :
            <div className="text-xl font-bold text-slate-800">{value}</div>}
        </CardContent>
    </Card>
);

export default function DashboardStats({ data, isLoading }: { data: any, isLoading: boolean }) {
    const d = data || {};
    const nf = (num: number) => num != null ? num.toLocaleString() : '0';
    const dailyTotal = (
        (d.d_floor_sales || 0) + (d.d_amazon_amount || 0) + (d.d_rakuten_amount || 0) +
        (d.d_yahoo_amount || 0) + (d.d_mercari_amount || 0) + (d.d_base_amount || 0) + (d.d_qoo10_amount || 0)
    );

    const dailyStats = [
        { title: 'フロア日計', value: `${nf(d.d_floor_sales)} 円` },
        { title: 'レジ通過', value: `${nf(d.d_register_count)} 人` },
        { title: 'Amazon', value: `${nf(d.d_amazon_amount)} 円` },
        { title: '楽天', value: `${nf(d.d_rakuten_amount)} 円` },
        { title: 'Yahoo!', value: `${nf(d.d_yahoo_amount)} 円` },
        { title: 'メルカリ', value: `${nf(d.d_mercari_amount)} 円` },
        { title: 'BASE', value: `${nf(d.d_base_amount)} 円` },
        { title: 'Qoo10', value: `${nf(d.d_qoo10_amount)} 円` },
        { title: '日計合計', value: `${nf(dailyTotal)} 円` },
    ];

    const monthlyStats = [
        { title: 'フロア累計', value: `${nf(d.m_floor_total)} 円` },
        { title: 'Amazon累計', value: `${nf(d.m_amazon_total)} 円` },
        { title: '楽天累計', value: `${nf(d.m_rakuten_total)} 円` },
        { title: 'Yahoo!累計', value: `${nf(d.m_yahoo_total)} 円` },
        { title: 'メルカリ累計', value: `${nf(d.m_mercari_total)} 円` },
        { title: 'BASE累計', value: `${nf(d.m_base_total)} 円` },
        { title: 'Qoo10累計', value: `${nf(d.m_qoo10_total)} 円` },
        { title: '総合計', value: `${nf(d.m_grand_total)} 円` },
    ];

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-slate-600 mb-2">日計サマリー</h3>
                <div className="grid grid-cols-3 lg:grid-cols-9 gap-2 md:gap-4">
                    {dailyStats.map(stat => <StatCard key={stat.title} title={stat.title} value={stat.value} isLoading={isLoading}/>)}
                </div>
            </div>
            <div>
                <h3 className="text-sm font-semibold text-slate-600 mb-2">月累計サマリー</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 md:gap-4">
                    {monthlyStats.map(stat => <StatCard key={stat.title} title={stat.title} value={stat.value} isLoading={isLoading}/>)}
                </div>
            </div>
        </div>
    );
}
