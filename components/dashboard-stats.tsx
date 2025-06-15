// ... (StatCardコンポーネントなど)

export default function DashboardStats({ data, isLoading }: { data: any, isLoading: boolean }) {
    // ... (既存のコード)

    const monthlyStats = [
        { title: 'フロア累計', value: `${nf(d.m_floor_total)} 円` },
        // ★レジ通過累計をここに追加
        { title: 'レジ通過累計', value: `${nf(d.m_register_count_total)} 人` }, 
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
            {/* ... (日計サマリー部分) ... */}
            <div>
                <h3 className="text-sm font-semibold text-slate-600 mb-2">月累計サマリー</h3>
                {/* ★grid-cols-9 に変更して上段と数を合わせる */}
                <div className="grid grid-cols-3 lg:grid-cols-9 gap-2 md:gap-4">
                    {monthlyStats.map(stat => <StatCard key={stat.title} title={stat.title} value={stat.value} isLoading={isLoading}/>)}
                </div>
            </div>
        </div>
    );
}
