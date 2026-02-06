
'use client';

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Plus } from "lucide-react";
import KpiTargetModal from "./KpiTargetModal";
import { KpiSummary, ChannelCode } from "@/app/kpi/actions";

interface KpiPageClientProps {
    fiscalYear: number;
    data: KpiSummary;
    summaryMetrics: {
        totalActual: number;
        totalTarget: number;
        totalLastYear: number;
        totalTwoYearsAgo: number;
        achievementRate: number;
        yoyGrowthIds: number;
    };
}

export default function KpiPageClient({ fiscalYear, data, summaryMetrics }: KpiPageClientProps) {
    const router = useRouter();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(val);
    };

    const formatPercent = (val: number) => {
        return new Intl.NumberFormat('ja-JP', { style: 'percent', maximumFractionDigits: 1 }).format(val / 100);
    };

    const handleYearChange = (val: string) => {
        router.push(`/kpi?year=${val}`);
    };

    // Prepare initial data for modal
    const modalInitialData: { [key: string]: number } = {};

    // 1. Channel Sales Targets
    data.total.forEach(row => {
        const channels: ChannelCode[] = ['WEB', 'WHOLESALE', 'STORE', 'SHOKU'];
        channels.forEach(c => {
            const channelRow = data.channels[c].find(r => r.month === row.month);
            if (channelRow) {
                modalInitialData[`${c}_${row.month}`] = channelRow.target;
            }
        });
    });

    // 2. Sales Activity (Acquisition)
    // We expect data.salesActivity to be present (it was added to KpiSummary interface)
    if (data.salesActivity) {
        data.salesActivity.forEach(row => {
            modalInitialData[`acquisition_target_${row.month}`] = row.target;
            modalInitialData[`acquisition_actual_${row.month}`] = row.actual;
        });
    }

    // 3. Manufacturing
    if (data.manufacturing) {
        data.manufacturing.forEach(row => {
            modalInitialData[`manufacturing_target_${row.month}`] = row.target;
            modalInitialData[`manufacturing_actual_${row.month}`] = row.actual;
        });
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between pb-4">
                <div className="flex items-center gap-2">
                    <Select value={fiscalYear.toString()} onValueChange={handleYearChange}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="年度を選択" />
                        </SelectTrigger>
                        <SelectContent>
                            {[0, 1, 2, 3].map(i => {
                                const y = new Date().getFullYear() + 1 - i;
                                return <SelectItem key={y} value={y.toString()}>{`FY${y} (8月期)`}</SelectItem>;
                            })}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setIsModalOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        目標値入力
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">年間売上合計</CardTitle>
                        <span className="text-muted-foreground text-xs">FY{fiscalYear}</span>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summaryMetrics.totalActual)}</div>
                        <p className="text-xs text-muted-foreground">
                            目標: {formatCurrency(summaryMetrics.totalTarget)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">目標達成率</CardTitle>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            className="h-4 w-4 text-muted-foreground"
                        >
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${summaryMetrics.achievementRate >= 100 ? 'text-green-600' : 'text-yellow-600'}`}>
                            {formatPercent(summaryMetrics.achievementRate)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            残目標: {formatCurrency(Math.max(0, summaryMetrics.totalTarget - summaryMetrics.totalActual))}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">前年比 (YoY)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${summaryMetrics.yoyGrowthIds >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {summaryMetrics.yoyGrowthIds > 0 ? '+' : ''}{formatPercent(summaryMetrics.yoyGrowthIds)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            前年実績: {formatCurrency(summaryMetrics.totalLastYear)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">前々年比</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-700">
                            {summaryMetrics.totalTwoYearsAgo > 0
                                ? formatPercent((summaryMetrics.totalActual - summaryMetrics.totalTwoYearsAgo) / summaryMetrics.totalTwoYearsAgo * 100)
                                : '-'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            前々年実績: {formatCurrency(summaryMetrics.totalTwoYearsAgo)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <KpiTargetModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                fiscalYear={fiscalYear}
                initialData={modalInitialData}
                onSuccess={() => router.refresh()}
            />

            <div className="mt-8">
                <h3 className="text-lg font-medium mb-4">月次・部門別集計表</h3>
                <div className="overflow-x-auto border rounded-md">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 text-gray-700 font-semibold">
                            <tr>
                                <th className="p-3 min-w-[120px]">部門 / 月</th>
                                {data.months.map(m => (
                                    <th key={m} className="p-3 text-right bg-white min-w-[100px] border-l">
                                        {new Date(m).getMonth() + 1}月
                                    </th>
                                ))}
                                <th className="p-3 text-right bg-gray-50 border-l min-w-[120px]">合計</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {/* Channels */}
                            {(['WEB', 'WHOLESALE', 'STORE', 'SHOKU'] as ChannelCode[]).map(channel => {
                                const label = channel === 'WEB' ? 'Web販売' :
                                    channel === 'WHOLESALE' ? '卸・OEM' :
                                        channel === 'STORE' ? '会津ブランド館' : '食のブランド館';
                                const rowData = data.channels[channel];
                                const channelTotal = rowData.reduce((sum, r) => sum + r.actual, 0);

                                return (
                                    <tr key={channel} className="hover:bg-gray-50/50">
                                        <td className="p-3 font-medium border-r bg-gray-50/30">{label}</td>
                                        {rowData.map(r => (
                                            <td key={r.month} className="p-3 text-right border-l tabular-nums">
                                                {r.actual.toLocaleString()}
                                            </td>
                                        ))}
                                        <td className="p-3 text-right font-bold border-l bg-gray-50/30 tabular-nums">
                                            {channelTotal.toLocaleString()}
                                        </td>
                                    </tr>
                                );
                            })}

                            {/* Total Row */}
                            <tr className="bg-gray-100/50 font-bold border-t-2 border-gray-200">
                                <td className="p-3 border-r">合計</td>
                                {data.total.map(r => (
                                    <td key={r.month} className="p-3 text-right border-l tabular-nums">
                                        {r.actual.toLocaleString()}
                                    </td>
                                ))}
                                <td className="p-3 text-right border-l tabular-nums">
                                    {summaryMetrics.totalActual.toLocaleString()}
                                </td>
                            </tr>

                            {/* Target Row */}
                            <tr className="text-gray-500 text-xs">
                                <td className="p-3 border-r bg-gray-50/30">目標</td>
                                {data.total.map(r => (
                                    <td key={r.month} className="p-3 text-right border-l tabular-nums">
                                        {r.target > 0 ? r.target.toLocaleString() : '-'}
                                    </td>
                                ))}
                                <td className="p-3 text-right border-l tabular-nums">
                                    {summaryMetrics.totalTarget.toLocaleString()}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Sales Activity Table */}
            {data.salesActivity && data.salesActivity.length > 0 && (
                <div className="mt-8">
                    <h3 className="text-lg font-medium mb-4">営業活動実績（新規・OEM獲得数）</h3>
                    <div className="overflow-x-auto border rounded-md">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-orange-50 text-gray-700 font-semibold">
                                <tr>
                                    <th className="p-3 min-w-[120px]">項目 / 月</th>
                                    {data.months.map(m => (
                                        <th key={m} className="p-3 text-right bg-white min-w-[100px] border-l">
                                            {new Date(m).getMonth() + 1}月
                                        </th>
                                    ))}
                                    <th className="p-3 text-right bg-orange-50 border-l min-w-[120px]">合計</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {/* Target Row */}
                                <tr className="hover:bg-gray-50/50">
                                    <td className="p-3 font-medium border-r bg-gray-50/30">新規・OEM 目標件数</td>
                                    {data.salesActivity.map(r => (
                                        <td key={`target-${r.month}`} className="p-3 text-right border-l tabular-nums text-blue-600">
                                            {r.target > 0 ? r.target : '-'}
                                        </td>
                                    ))}
                                    <td className="p-3 text-right font-bold border-l bg-gray-50/30 tabular-nums">
                                        {data.salesActivity.reduce((sum, r) => sum + r.target, 0)}
                                    </td>
                                </tr>
                                {/* Actual Row */}
                                <tr className="hover:bg-gray-50/50">
                                    <td className="p-3 font-medium border-r bg-gray-50/30">実績</td>
                                    {data.salesActivity.map(r => (
                                        <td key={`actual-${r.month}`} className="p-3 text-right border-l tabular-nums font-bold">
                                            {r.actual}
                                        </td>
                                    ))}
                                    <td className="p-3 text-right font-bold border-l bg-gray-50/30 tabular-nums">
                                        {data.salesActivity.reduce((sum, r) => sum + r.actual, 0)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Manufacturing Table */}
            {data.manufacturing && data.manufacturing.length > 0 && (
                <div className="mt-8">
                    <h3 className="text-lg font-medium mb-4">商品製造数</h3>
                    <div className="overflow-x-auto border rounded-md">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-blue-50 text-gray-700 font-semibold">
                                <tr>
                                    <th className="p-3 min-w-[120px]">項目 / 月</th>
                                    {data.months.map(m => (
                                        <th key={m} className="p-3 text-right bg-white min-w-[100px] border-l">
                                            {new Date(m).getMonth() + 1}月
                                        </th>
                                    ))}
                                    <th className="p-3 text-right bg-blue-50 border-l min-w-[120px]">合計</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {/* Target Row */}
                                <tr className="hover:bg-gray-50/50">
                                    <td className="p-3 font-medium border-r bg-gray-50/30">製造目標</td>
                                    {data.manufacturing.map(r => (
                                        <td key={`man-target-${r.month}`} className="p-3 text-right border-l tabular-nums text-blue-600">
                                            {r.target > 0 ? r.target.toLocaleString() : '-'}
                                        </td>
                                    ))}
                                    <td className="p-3 text-right font-bold border-l bg-gray-50/30 tabular-nums">
                                        {data.manufacturing.reduce((sum, r) => sum + r.target, 0).toLocaleString()}
                                    </td>
                                </tr>
                                {/* Actual Row */}
                                <tr className="hover:bg-gray-50/50">
                                    <td className="p-3 font-medium border-r bg-gray-50/30">製造実績</td>
                                    {data.manufacturing.map(r => (
                                        <td key={`man-actual-${r.month}`} className="p-3 text-right border-l tabular-nums font-bold">
                                            {r.actual.toLocaleString()}
                                        </td>
                                    ))}
                                    <td className="p-3 text-right font-bold border-l bg-gray-50/30 tabular-nums">
                                        {data.manufacturing.reduce((sum, r) => sum + r.actual, 0).toLocaleString()}
                                    </td>
                                </tr>
                                {/* Last Year */}
                                <tr className="text-gray-500 text-xs">
                                    <td className="p-3 border-r bg-gray-50/30">前年実績</td>
                                    {data.manufacturing.map(r => (
                                        <td key={`man-ly-${r.month}`} className="p-3 text-right border-l tabular-nums">
                                            {r.lastYear.toLocaleString()}
                                        </td>
                                    ))}
                                    <td className="p-3 text-right border-l tabular-nums">
                                        {data.manufacturing.reduce((sum, r) => sum + r.lastYear, 0).toLocaleString()}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
