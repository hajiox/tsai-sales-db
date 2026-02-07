
'use client';

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import KpiTargetModal from "./KpiTargetModal";
import { KpiSummary, ChannelCode, updateKpiEntry } from "@/app/kpi/actions";
import { formatCurrency, formatPercent } from '@/lib/utils';

// Inline Editable Component
function EditableCell({
    value,
    type,
    onSave
}: {
    value: number,
    type: 'currency' | 'number',
    onSave: (val: number) => Promise<void>
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value.toString());
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setLocalValue(value.toString());
    }, [value]);

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            await save();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setLocalValue(value.toString());
        }
    };

    const save = async () => {
        const newVal = parseFloat(localValue);
        if (isNaN(newVal)) {
            setLocalValue(value.toString());
            setIsEditing(false);
            return;
        }

        if (newVal === value) {
            setIsEditing(false);
            return;
        }

        setIsLoading(true);
        try {
            await onSave(newVal);
            setIsEditing(false);
        } catch (error) {
            console.error('Failed to save', error);
            // Revert on error
            setLocalValue(value.toString());
        } finally {
            setIsLoading(false);
        }
    };

    if (isEditing) {
        return (
            <input
                type="number"
                className="w-20 p-1 text-right border rounded text-sm"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={save}
                onKeyDown={handleKeyDown}
                autoFocus
                disabled={isLoading}
            />
        );
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            className={`cursor-pointer hover:bg-gray-100 p-1 rounded text-right ${isLoading ? 'opacity-50' : ''}`}
        >
            {type === 'currency' ? value.toLocaleString() : value}
        </div>
    );
}

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

    const handleYearChange = (val: string) => {
        router.push(`/kpi?year=${val}`);
    };

    const handleUpdate = async (channel: string, metric: string, month: string, amount: number) => {
        await updateKpiEntry(channel, metric, month, amount);
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

    // 2. Sales Activity
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
            </div>

            <KpiTargetModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                fiscalYear={fiscalYear}
                initialData={modalInitialData}
                onSuccess={() => router.refresh()}
            />

            {/* Main Table: Monthly/Departmental */}
            <div>
                <h2 className="text-xl font-bold mb-4">月次・部門別集計</h2>
                <div className="overflow-x-auto border rounded-md shadow-sm">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-gray-100/80 text-gray-700 font-semibold sticky top-0">
                            <tr>
                                <th className="p-3 border-r min-w-[200px] z-10 bg-gray-100/80 sticky left-0">部門 / 項目</th>
                                <th className="p-3 border-r w-[100px] bg-gray-100/80">内訳</th>
                                {data.months.map(m => (
                                    <th key={m} className="p-3 text-right border-l bg-white min-w-[100px]">
                                        {new Date(m).getMonth() + 1}月
                                    </th>
                                ))}
                                <th className="p-3 text-right border-l bg-gray-100/80 min-w-[120px]">合計</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-300">
                            {/* Channels Loop - Order: Shoku, Store, Web, Wholesale */}
                            {(['SHOKU', 'STORE', 'WEB', 'WHOLESALE'] as ChannelCode[]).map(channel => {
                                const label = channel === 'SHOKU' ? '道の駅 食のブランド館' :
                                    channel === 'STORE' ? '会津ブランド館 （店舗）' :
                                        channel === 'WEB' ? '会津ブランド館 （ネット販売）' :
                                            '外販・ＯＥＭ 本社売上';
                                const rowData = data.channels[channel];

                                // Totals
                                const totalActual = rowData.reduce((sum, r) => sum + r.actual, 0);
                                const totalTarget = rowData.reduce((sum, r) => sum + r.target, 0);
                                const totalLastYear = rowData.reduce((sum, r) => sum + r.lastYear, 0);

                                return (
                                    <React.Fragment key={channel}>
                                        {/* Channel Header Row (merged visually by first col) */}
                                        <tr className="bg-gray-50/50">
                                            <td className="p-3 font-bold border-r bg-gray-100" rowSpan={5} style={{ verticalAlign: 'top' }}>
                                                {label}
                                            </td>
                                        </tr>

                                        {/* 1. Last Year Actual */}
                                        <tr className="hover:bg-gray-50/30">
                                            <td className="p-2 border-r text-gray-500 text-xs text-right">前年度実績</td>
                                            {rowData.map(r => (
                                                <td key={`ly-${r.month}`} className="p-2 text-right border-l tabular-nums text-gray-500">
                                                    {r.lastYear.toLocaleString()}
                                                </td>
                                            ))}
                                            <td className="p-2 text-right border-l tabular-nums font-medium text-gray-500">
                                                {totalLastYear.toLocaleString()}
                                            </td>
                                        </tr>

                                        {/* 2. Target */}
                                        <tr className="hover:bg-gray-50/30">
                                            <td className="p-2 border-r text-blue-600 font-medium text-right">今年度目標</td>
                                            {rowData.map(r => (
                                                <td key={`target-${r.month}`} className="p-2 text-right border-l tabular-nums text-blue-600">
                                                    <EditableCell
                                                        value={r.target}
                                                        type="currency"
                                                        onSave={(val) => handleUpdate(channel, 'target', r.month, val)}
                                                    />
                                                </td>
                                            ))}
                                            <td className="p-2 text-right border-l tabular-nums font-bold text-blue-600">
                                                {totalTarget.toLocaleString()}
                                            </td>
                                        </tr>

                                        {/* 3. Actual */}
                                        <tr className="hover:bg-gray-50/30">
                                            <td className="p-2 border-r font-bold text-right">実績</td>
                                            {rowData.map(r => (
                                                <td key={`actual-${r.month}`} className="p-2 text-right border-l tabular-nums font-bold">
                                                    <EditableCell
                                                        value={r.actual}
                                                        type="currency"
                                                        onSave={(val) => handleUpdate(channel, 'actual', r.month, val)}
                                                    />
                                                </td>
                                            ))}
                                            <td className="p-2 text-right border-l tabular-nums font-bold">
                                                {totalActual.toLocaleString()}
                                            </td>
                                        </tr>

                                        {/* 4. Achievement Rate */}
                                        <tr className="hover:bg-gray-50/30">
                                            <td className="p-2 border-r text-xs text-right">目標達成率 (%)</td>
                                            {rowData.map(r => {
                                                const rate = r.target > 0 ? (r.actual / r.target) * 100 : 0;
                                                return (
                                                    <td key={`rate-${r.month}`} className={`p-2 text-right border-l tabular-nums text-xs ${rate >= 100 ? 'text-green-600 font-bold' : ''}`}>
                                                        {r.target > 0 ? formatPercent(rate) : '-'}
                                                    </td>
                                                );
                                            })}
                                            <td className="p-2 text-right border-l tabular-nums text-xs font-bold">
                                                {totalTarget > 0 ? formatPercent((totalActual / totalTarget) * 100) : '-'}
                                            </td>
                                        </tr>

                                        {/* 5. YoY Growth */}
                                        <tr className="border-b-2 border-gray-300 hover:bg-gray-50/30">
                                            <td className="p-2 border-r text-xs text-right">前年度対比 (%)</td>
                                            {rowData.map(r => {
                                                const rate = r.lastYear > 0 ? (r.actual / r.lastYear) * 100 : 0;
                                                // Only show if actual > 0 (to avoid 0% when data not yet in)
                                                return (
                                                    <td key={`yoy-${r.month}`} className="p-2 text-right border-l tabular-nums text-xs">
                                                        {r.actual > 0 && r.lastYear > 0 ? formatPercent(rate) : '-'}
                                                    </td>
                                                );
                                            })}
                                            <td className="p-2 text-right border-l tabular-nums text-xs font-bold">
                                                {totalLastYear > 0 ? formatPercent((totalActual / totalLastYear) * 100) : '-'}
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            })}

                            {/* Grand Total Block */}
                            {(() => {
                                const totalRowData = data.total;
                                const grandTotalActual = totalRowData.reduce((sum, r) => sum + r.actual, 0);
                                const grandTotalTarget = totalRowData.reduce((sum, r) => sum + r.target, 0);
                                const grandTotalLastYear = totalRowData.reduce((sum, r) => sum + r.lastYear, 0);

                                return (
                                    <React.Fragment key="total">
                                        <tr className="bg-gray-100 border-t-2 border-gray-400">
                                            <td className="p-3 font-bold border-r bg-gray-200" rowSpan={5} style={{ verticalAlign: 'top' }}>
                                                総合計
                                            </td>
                                        </tr>
                                        {/* 1. Last Year */}
                                        <tr className="bg-gray-50/50">
                                            <td className="p-2 border-r text-gray-500 text-xs text-right">前年度実績</td>
                                            {totalRowData.map(r => (
                                                <td key={`total-ly-${r.month}`} className="p-2 text-right border-l tabular-nums text-gray-500 font-medium">
                                                    {r.lastYear.toLocaleString()}
                                                </td>
                                            ))}
                                            <td className="p-2 text-right border-l tabular-nums font-bold text-gray-500">
                                                {grandTotalLastYear.toLocaleString()}
                                            </td>
                                        </tr>
                                        {/* 2. Target */}
                                        <tr className="bg-gray-50/50">
                                            <td className="p-2 border-r text-blue-800 font-medium text-right">今年度目標</td>
                                            {totalRowData.map(r => (
                                                <td key={`total-target-${r.month}`} className="p-2 text-right border-l tabular-nums text-blue-800 font-bold">
                                                    {r.target.toLocaleString()}
                                                </td>
                                            ))}
                                            <td className="p-2 text-right border-l tabular-nums font-bold text-blue-800">
                                                {grandTotalTarget.toLocaleString()}
                                            </td>
                                        </tr>
                                        {/* 3. Actual */}
                                        <tr className="bg-gray-100/50">
                                            <td className="p-2 border-r font-bold text-right">実績</td>
                                            {totalRowData.map(r => (
                                                <td key={`total-actual-${r.month}`} className="p-2 text-right border-l tabular-nums font-bold text-lg">
                                                    {r.actual.toLocaleString()}
                                                </td>
                                            ))}
                                            <td className="p-2 text-right border-l tabular-nums font-bold text-lg">
                                                {grandTotalActual.toLocaleString()}
                                            </td>
                                        </tr>
                                        {/* 4. Rate */}
                                        <tr className="bg-gray-50/50">
                                            <td className="p-2 border-r text-xs text-right">目標達成率 (%)</td>
                                            {totalRowData.map(r => {
                                                const rate = r.target > 0 ? (r.actual / r.target) * 100 : 0;
                                                return (
                                                    <td key={`total-rate-${r.month}`} className={`p-2 text-right border-l tabular-nums text-xs ${rate >= 100 ? 'text-green-700 font-bold' : ''}`}>
                                                        {r.target > 0 ? formatPercent(rate) : '-'}
                                                    </td>
                                                );
                                            })}
                                            <td className="p-2 text-right border-l tabular-nums text-xs font-bold">
                                                {grandTotalTarget > 0 ? formatPercent((grandTotalActual / grandTotalTarget) * 100) : '-'}
                                            </td>
                                        </tr>
                                        {/* 5. YoY */}
                                        <tr className="border-b-4 border-double border-gray-400 bg-gray-50/50">
                                            <td className="p-2 border-r text-xs text-right">前年度対比 (%)</td>
                                            {totalRowData.map(r => {
                                                const rate = r.lastYear > 0 ? (r.actual / r.lastYear) * 100 : 0;
                                                return (
                                                    <td key={`total-yoy-${r.month}`} className="p-2 text-right border-l tabular-nums text-xs">
                                                        {r.actual > 0 && r.lastYear > 0 ? formatPercent(rate) : '-'}
                                                    </td>
                                                );
                                            })}
                                            <td className="p-2 text-right border-l tabular-nums text-xs font-bold">
                                                {grandTotalLastYear > 0 ? formatPercent((grandTotalActual / grandTotalLastYear) * 100) : '-'}
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            })()}
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
                                    <th className="p-3 min-w-[200px]">項目 / 月</th>
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
                                    <td className="p-3 font-medium border-r bg-gray-50/30 text-right">新規・OEM 目標件数</td>
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
                                    <td className="p-3 font-medium border-r bg-gray-50/30 text-right">実績</td>
                                    {data.salesActivity.map(r => (
                                        <td key={`actual-${r.month}`} className="p-3 text-right border-l tabular-nums font-bold">
                                            {r.actual}
                                        </td>
                                    ))}
                                    <td className="p-3 text-right font-bold border-l bg-gray-50/30 tabular-nums">
                                        {data.salesActivity.reduce((sum, r) => sum + r.actual, 0)}
                                    </td>
                                </tr>
                                {/* Achievement Rate */}
                                <tr className="hover:bg-gray-50/50">
                                    <td className="p-3 text-xs border-r bg-gray-50/30 text-right">目標達成率 (%)</td>
                                    {data.salesActivity.map(r => {
                                        const rate = r.target > 0 ? (r.actual / r.target) * 100 : 0;
                                        return (
                                            <td key={`rate-${r.month}`} className={`p-3 text-right border-l tabular-nums text-xs ${rate >= 100 ? 'text-green-600 font-bold' : ''}`}>
                                                {r.target > 0 ? formatPercent(rate) : '-'}
                                            </td>
                                        );
                                    })}
                                    <td className="p-3 text-right border-l bg-gray-50/30 tabular-nums text-xs font-bold">
                                        {/* Simple Total Rate */}
                                        {(() => {
                                            const t = data.salesActivity.reduce((sum, r) => sum + r.target, 0);
                                            const a = data.salesActivity.reduce((sum, r) => sum + r.actual, 0);
                                            return t > 0 ? formatPercent((a / t) * 100) : '-';
                                        })()}
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
                                    <th className="p-3 min-w-[200px]">項目 / 月</th>
                                    {data.months.map(m => (
                                        <th key={m} className="p-3 text-right bg-white min-w-[100px] border-l">
                                            {new Date(m).getMonth() + 1}月
                                        </th>
                                    ))}
                                    <th className="p-3 text-right bg-blue-50 border-l min-w-[120px]">合計</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {/* Last Year */}
                                <tr className="text-gray-500 text-xs">
                                    <td className="p-3 border-r bg-gray-50/30 text-right">前年度実績</td>
                                    {data.manufacturing.map(r => (
                                        <td key={`man-ly-${r.month}`} className="p-3 text-right border-l tabular-nums">
                                            {r.lastYear.toLocaleString()}
                                        </td>
                                    ))}
                                    <td className="p-3 text-right border-l tabular-nums">
                                        {data.manufacturing.reduce((sum, r) => sum + r.lastYear, 0).toLocaleString()}
                                    </td>
                                </tr>
                                {/* Target Row */}
                                <tr className="hover:bg-gray-50/50">
                                    <td className="p-3 font-medium border-r bg-gray-50/30 text-right">製造目標</td>
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
                                    <td className="p-3 font-medium border-r bg-gray-50/30 text-right">製造実績</td>
                                    {data.manufacturing.map(r => (
                                        <td key={`man-actual-${r.month}`} className="p-3 text-right border-l tabular-nums font-bold">
                                            {r.actual.toLocaleString()}
                                        </td>
                                    ))}
                                    <td className="p-3 text-right font-bold border-l bg-gray-50/30 tabular-nums">
                                        {data.manufacturing.reduce((sum, r) => sum + r.actual, 0).toLocaleString()}
                                    </td>
                                </tr>
                                {/* Achievement Rate */}
                                <tr className="hover:bg-gray-50/50">
                                    <td className="p-3 text-xs border-r bg-gray-50/30 text-right">目標達成率 (%)</td>
                                    {data.manufacturing.map(r => {
                                        const rate = r.target > 0 ? (r.actual / r.target) * 100 : 0;
                                        return (
                                            <td key={`man-rate-${r.month}`} className={`p-3 text-right border-l tabular-nums text-xs ${rate >= 100 ? 'text-green-600 font-bold' : ''}`}>
                                                {r.target > 0 ? formatPercent(rate) : '-'}
                                            </td>
                                        );
                                    })}
                                    <td className="p-3 text-right border-l bg-gray-50/30 tabular-nums text-xs font-bold">
                                        {(() => {
                                            const t = data.manufacturing.reduce((sum, r) => sum + r.target, 0);
                                            const a = data.manufacturing.reduce((sum, r) => sum + r.actual, 0);
                                            return t > 0 ? formatPercent((a / t) * 100) : '-';
                                        })()}
                                    </td>
                                </tr>
                                {/* YoY */}
                                <tr className="hover:bg-gray-50/50">
                                    <td className="p-3 text-xs border-r bg-gray-50/30 text-right">前年度対比 (%)</td>
                                    {data.manufacturing.map(r => {
                                        const rate = r.lastYear > 0 ? (r.actual / r.lastYear) * 100 : 0;
                                        return (
                                            <td key={`man-yoy-${r.month}`} className="p-3 text-right border-l tabular-nums text-xs">
                                                {r.actual > 0 && r.lastYear > 0 ? formatPercent(rate) : '-'}
                                            </td>
                                        );
                                    })}
                                    <td className="p-3 text-right border-l bg-gray-50/30 tabular-nums text-xs font-bold">
                                        {(() => {
                                            const ly = data.manufacturing.reduce((sum, r) => sum + r.lastYear, 0);
                                            const a = data.manufacturing.reduce((sum, r) => sum + r.actual, 0);
                                            return ly > 0 ? formatPercent((a / ly) * 100) : '-';
                                        })()}
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
