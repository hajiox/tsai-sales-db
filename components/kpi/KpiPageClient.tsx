
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

// Achievement rate color helper
function getRateStyle(rate: number, actual?: number): string {
    if (actual !== undefined && actual === 0) return '';
    if (rate >= 100) return 'text-green-600 font-bold';
    if (rate >= 90) return 'text-blue-600 font-bold';
    if (rate < 80) return 'text-red-600 font-bold';
    return '';
}
function RateCell({ rate, hasTarget, showWarning = true }: { rate: number; hasTarget: boolean; showWarning?: boolean }) {
    if (!hasTarget) return <span>-</span>;
    return (
        <div className="flex flex-col items-end">
            <span>{formatPercent(rate)}</span>
            {showWarning && rate < 80 && <span className="text-red-500 text-[9px] leading-tight">⚠ 警告</span>}
        </div>
    );
}

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
                type="text"
                inputMode="decimal"
                className="w-24 p-1 text-right border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
        elapsedMonthCount: number;
        remainingMonths: number;
        elapsedTarget: number;
        elapsedLastYear: number;
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
        <>
            {/* Print CSS: A3 landscape */}
            <style jsx global>{`
                @media print {
                    @page {
                        size: A3 landscape;
                        margin: 8mm;
                    }
                    body {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }
            `}</style>
            <div className="space-y-4">
                {/* Print-only header */}
                <div className="hidden print:block mb-2">
                    <h1 className="text-xl font-bold">KPI ダッシュボード - FY{fiscalYear} (7月期)</h1>
                </div>
                <div className="flex items-center justify-between pb-4 print:hidden">
                    <div className="flex items-center gap-2">
                        <Select value={fiscalYear.toString()} onValueChange={handleYearChange}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="年度を選択" />
                            </SelectTrigger>
                            <SelectContent>
                                {[0, 1, 2, 3].map(i => {
                                    const y = new Date().getFullYear() + 1 - i;
                                    return <SelectItem key={y} value={y.toString()}>{`FY${y} (7月期)`}</SelectItem>;
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setIsModalOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            目標値入力
                        </Button>
                        <Button variant="outline" onClick={() => window.print()}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect width="12" height="8" x="6" y="14" /></svg>
                            印刷
                        </Button>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 print:hidden">
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
                            <CardTitle className="text-sm font-medium">進捗達成率</CardTitle>
                            <span className="text-muted-foreground text-xs">{summaryMetrics.elapsedMonthCount}/12ヶ月経過</span>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${summaryMetrics.achievementRate >= 100 ? 'text-green-600' : 'text-yellow-600'}`}>
                                {formatPercent(summaryMetrics.achievementRate)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                経過月目標: {formatCurrency(summaryMetrics.elapsedTarget)} / 残り{summaryMetrics.remainingMonths}ヶ月
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">前年比 (YoY)</CardTitle>
                            <span className="text-muted-foreground text-xs">{summaryMetrics.elapsedMonthCount}/12ヶ月経過</span>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${summaryMetrics.yoyGrowthIds >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {summaryMetrics.yoyGrowthIds > 0 ? '+' : ''}{formatPercent(summaryMetrics.yoyGrowthIds)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                前年同期実績: {formatCurrency(summaryMetrics.elapsedLastYear)}
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
                <div className="print:hidden">
                    <h2 className="text-xl font-bold mb-4">月次・部門別集計</h2>
                    <div className="border rounded-md shadow-sm">
                        <table className="w-full text-xs text-left border-collapse table-fixed">
                            <thead className="bg-gray-100/80 text-gray-700 font-semibold sticky top-0">
                                <tr>
                                    <th className="p-2 border-r z-10 bg-gray-100/80 sticky left-0 w-[140px]">部門 / 項目</th>
                                    <th className="p-2 border-r bg-gray-100/80 w-[60px]">内訳</th>
                                    {data.months.map(m => (
                                        <th key={m} className="p-2 text-right border-l bg-white">
                                            {new Date(m).getMonth() + 1}月
                                        </th>
                                    ))}
                                    <th className="p-2 text-right border-l bg-gray-100/80 w-[80px]">合計</th>
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
                                                <td className="p-2 font-bold border-r bg-gray-100 text-xs" rowSpan={5} style={{ verticalAlign: 'top' }}>
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
                                            <tr className="bg-amber-50/80 hover:bg-amber-100/60">
                                                <td className="p-2 border-r font-bold text-right text-amber-900">実績</td>
                                                {rowData.map(r => (
                                                    <td key={`actual-${r.month}`} className="p-2 text-right border-l tabular-nums font-bold text-amber-900">
                                                        <EditableCell
                                                            value={r.actual}
                                                            type="currency"
                                                            onSave={(val) => handleUpdate(channel, 'actual', r.month, val)}
                                                        />
                                                    </td>
                                                ))}
                                                <td className="p-2 text-right border-l tabular-nums font-bold text-amber-900">
                                                    {totalActual.toLocaleString()}
                                                </td>
                                            </tr>

                                            {/* 4. Achievement Rate */}
                                            <tr className="hover:bg-gray-50/30">
                                                <td className="p-2 border-r text-xs text-right">目標達成率 (%)</td>
                                                {rowData.map(r => {
                                                    const rate = r.target > 0 ? (r.actual / r.target) * 100 : 0;
                                                    return (
                                                        <td key={`rate-${r.month}`} className={`p-2 text-right border-l tabular-nums text-xs ${getRateStyle(rate, r.actual)}`}>
                                                            <RateCell rate={rate} hasTarget={r.target > 0} showWarning={r.actual > 0} />
                                                        </td>
                                                    );
                                                })}
                                                {(() => {
                                                    const totalRate = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
                                                    return (
                                                        <td className={`p-2 text-right border-l tabular-nums text-xs ${getRateStyle(totalRate)}`}>
                                                            <RateCell rate={totalRate} hasTarget={totalTarget > 0} showWarning={false} />
                                                        </td>
                                                    );
                                                })()}
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
                                                <td className="p-2 font-bold border-r bg-gray-200 text-xs" rowSpan={5} style={{ verticalAlign: 'top' }}>
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
                                            <tr className="bg-amber-50/80">
                                                <td className="p-2 border-r font-bold text-right text-amber-900">実績</td>
                                                {totalRowData.map(r => (
                                                    <td key={`total-actual-${r.month}`} className="p-2 text-right border-l tabular-nums font-bold text-sm text-amber-900">
                                                        {r.actual.toLocaleString()}
                                                    </td>
                                                ))}
                                                <td className="p-2 text-right border-l tabular-nums font-bold text-sm text-amber-900">
                                                    {grandTotalActual.toLocaleString()}
                                                </td>
                                            </tr>
                                            {/* 4. Rate */}
                                            <tr className="bg-gray-50/50">
                                                <td className="p-2 border-r text-xs text-right">目標達成率 (%)</td>
                                                {totalRowData.map(r => {
                                                    const rate = r.target > 0 ? (r.actual / r.target) * 100 : 0;
                                                    return (
                                                        <td key={`total-rate-${r.month}`} className={`p-2 text-right border-l tabular-nums text-xs ${getRateStyle(rate, r.actual)}`}>
                                                            <RateCell rate={rate} hasTarget={r.target > 0} showWarning={r.actual > 0} />
                                                        </td>
                                                    );
                                                })}
                                                {(() => {
                                                    const grandRate = grandTotalTarget > 0 ? (grandTotalActual / grandTotalTarget) * 100 : 0;
                                                    return (
                                                        <td className={`p-2 text-right border-l tabular-nums text-xs ${getRateStyle(grandRate)}`}>
                                                            <RateCell rate={grandRate} hasTarget={grandTotalTarget > 0} showWarning={false} />
                                                        </td>
                                                    );
                                                })()}
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
                    <div className="mt-8 print:hidden">
                        <h3 className="text-lg font-medium mb-4">営業活動実績（新規・OEM獲得数）</h3>
                        <div className="border rounded-md">
                            <table className="w-full text-xs text-left table-fixed">
                                <thead className="bg-orange-50 text-gray-700 font-semibold">
                                    <tr>
                                        <th className="p-2 w-[140px]">項目 / 月</th>
                                        {data.months.map(m => (
                                            <th key={m} className="p-2 text-right bg-white border-l">
                                                {new Date(m).getMonth() + 1}月
                                            </th>
                                        ))}
                                        <th className="p-2 text-right bg-orange-50 border-l w-[80px]">合計</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {/* Target Row */}
                                    <tr className="hover:bg-gray-50/50">
                                        <td className="p-2 font-medium border-r bg-gray-50/30 text-right">新規・OEM 目標件数</td>
                                        {data.salesActivity.map(r => (
                                            <td key={`target-${r.month}`} className="p-2 text-right border-l tabular-nums text-blue-600">
                                                <EditableCell
                                                    value={r.target}
                                                    type="number"
                                                    onSave={(val) => handleUpdate('SALES_TEAM', 'acquisition_target', r.month, val)}
                                                />
                                            </td>
                                        ))}
                                        <td className="p-2 text-right font-bold border-l bg-gray-50/30 tabular-nums">
                                            {data.salesActivity.reduce((sum, r) => sum + r.target, 0)}
                                        </td>
                                    </tr>
                                    {/* Actual Row */}
                                    <tr className="bg-amber-50/80 hover:bg-amber-100/60">
                                        <td className="p-2 font-medium border-r bg-amber-50/80 text-right text-amber-900">実績</td>
                                        {data.salesActivity.map(r => (
                                            <td key={`actual-${r.month}`} className="p-2 text-right border-l tabular-nums font-bold text-amber-900">
                                                <EditableCell
                                                    value={r.actual}
                                                    type="number"
                                                    onSave={(val) => handleUpdate('SALES_TEAM', 'acquisition_actual', r.month, val)}
                                                />
                                            </td>
                                        ))}
                                        <td className="p-2 text-right font-bold border-l bg-amber-50/80 tabular-nums text-amber-900">
                                            {data.salesActivity.reduce((sum, r) => sum + r.actual, 0)}
                                        </td>
                                    </tr>
                                    {/* Achievement Rate */}
                                    <tr className="hover:bg-gray-50/50">
                                        <td className="p-2 text-xs border-r bg-gray-50/30 text-right">目標達成率 (%)</td>
                                        {data.salesActivity.map(r => {
                                            const rate = r.target > 0 ? (r.actual / r.target) * 100 : 0;
                                            return (
                                                <td key={`rate-${r.month}`} className={`p-2 text-right border-l tabular-nums text-xs ${getRateStyle(rate, r.actual)}`}>
                                                    <RateCell rate={rate} hasTarget={r.target > 0} showWarning={r.actual > 0} />
                                                </td>
                                            );
                                        })}
                                        <td className="p-2 text-right border-l bg-gray-50/30 tabular-nums text-xs">
                                            {(() => {
                                                const t = data.salesActivity.reduce((sum, r) => sum + r.target, 0);
                                                const a = data.salesActivity.reduce((sum, r) => sum + r.actual, 0);
                                                const rate = t > 0 ? (a / t) * 100 : 0;
                                                return (
                                                    <span className={getRateStyle(rate)}>
                                                        <RateCell rate={rate} hasTarget={t > 0} showWarning={false} />
                                                    </span>
                                                );
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
                    <div className="mt-8 print:hidden">
                        <h3 className="text-lg font-medium mb-4">商品製造数</h3>
                        <div className="border rounded-md">
                            <table className="w-full text-xs text-left table-fixed">
                                <thead className="bg-blue-50 text-gray-700 font-semibold">
                                    <tr>
                                        <th className="p-2 w-[140px]">項目 / 月</th>
                                        {data.months.map(m => (
                                            <th key={m} className="p-2 text-right bg-white border-l">
                                                {new Date(m).getMonth() + 1}月
                                            </th>
                                        ))}
                                        <th className="p-2 text-right bg-blue-50 border-l w-[80px]">合計</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {/* Last Year */}
                                    <tr className="text-gray-500 text-xs">
                                        <td className="p-2 border-r bg-gray-50/30 text-right">前年度実績</td>
                                        {data.manufacturing.map(r => (
                                            <td key={`man-ly-${r.month}`} className="p-2 text-right border-l tabular-nums">
                                                {r.lastYear.toLocaleString()}
                                            </td>
                                        ))}
                                        <td className="p-2 text-right border-l tabular-nums">
                                            {data.manufacturing.reduce((sum, r) => sum + r.lastYear, 0).toLocaleString()}
                                        </td>
                                    </tr>
                                    {/* Target Row */}
                                    <tr className="hover:bg-gray-50/50">
                                        <td className="p-2 font-medium border-r bg-gray-50/30 text-right">製造目標</td>
                                        {data.manufacturing.map(r => (
                                            <td key={`man-target-${r.month}`} className="p-2 text-right border-l tabular-nums text-blue-600">
                                                <EditableCell
                                                    value={r.target}
                                                    type="number"
                                                    onSave={(val) => handleUpdate('FACTORY', 'manufacturing_target', r.month, val)}
                                                />
                                            </td>
                                        ))}
                                        <td className="p-2 text-right font-bold border-l bg-gray-50/30 tabular-nums">
                                            {data.manufacturing.reduce((sum, r) => sum + r.target, 0).toLocaleString()}
                                        </td>
                                    </tr>
                                    {/* Actual Row */}
                                    <tr className="hover:bg-gray-50/50">
                                        <td className="p-2 font-medium border-r bg-gray-50/30 text-right">製造実績</td>
                                        {data.manufacturing.map(r => (
                                            <td key={`man-actual-${r.month}`} className="p-2 text-right border-l tabular-nums font-bold">
                                                <EditableCell
                                                    value={r.actual}
                                                    type="number"
                                                    onSave={(val) => handleUpdate('FACTORY', 'manufacturing_actual', r.month, val)}
                                                />
                                            </td>
                                        ))}
                                        <td className="p-2 text-right font-bold border-l bg-gray-50/30 tabular-nums">
                                            {data.manufacturing.reduce((sum, r) => sum + r.actual, 0).toLocaleString()}
                                        </td>
                                    </tr>
                                    {/* Achievement Rate */}
                                    <tr className="hover:bg-gray-50/50">
                                        <td className="p-2 text-xs border-r bg-gray-50/30 text-right">目標達成率 (%)</td>
                                        {data.manufacturing.map(r => {
                                            const rate = r.target > 0 ? (r.actual / r.target) * 100 : 0;
                                            return (
                                                <td key={`man-rate-${r.month}`} className={`p-2 text-right border-l tabular-nums text-xs ${getRateStyle(rate, r.actual)}`}>
                                                    <RateCell rate={rate} hasTarget={r.target > 0} showWarning={r.actual > 0} />
                                                </td>
                                            );
                                        })}
                                        <td className="p-2 text-right border-l bg-gray-50/30 tabular-nums text-xs">
                                            {(() => {
                                                const t = data.manufacturing.reduce((sum, r) => sum + r.target, 0);
                                                const a = data.manufacturing.reduce((sum, r) => sum + r.actual, 0);
                                                const rate = t > 0 ? (a / t) * 100 : 0;
                                                return (
                                                    <span className={getRateStyle(rate)}>
                                                        <RateCell rate={rate} hasTarget={t > 0} showWarning={false} />
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                    {/* YoY */}
                                    <tr className="hover:bg-gray-50/50">
                                        <td className="p-2 text-xs border-r bg-gray-50/30 text-right">前年度対比 (%)</td>
                                        {data.manufacturing.map(r => {
                                            const rate = r.lastYear > 0 ? (r.actual / r.lastYear) * 100 : 0;
                                            return (
                                                <td key={`man-yoy-${r.month}`} className="p-2 text-right border-l tabular-nums text-xs">
                                                    {r.actual > 0 && r.lastYear > 0 ? formatPercent(rate) : '-'}
                                                </td>
                                            );
                                        })}
                                        <td className="p-2 text-right border-l bg-gray-50/30 tabular-nums text-xs font-bold">
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

                {/* ==================== PRINT-ONLY SECTION ==================== */}
                {(() => {
                    const channelList: { code: ChannelCode; label: string }[] = [
                        { code: 'SHOKU', label: '道の駅 食のブランド館' },
                        { code: 'STORE', label: '会津ブランド館（店舗）' },
                        { code: 'WEB', label: '会津ブランド館（ネット販売）' },
                        { code: 'WHOLESALE', label: '外販・OEM 本社売上' },
                    ];

                    const renderPrintHalf = (monthIndices: number[], halfLabel: string, showYearTotal: boolean) => {
                        const months = monthIndices.map(i => data.months[i]);
                        const colCount = 1 + monthIndices.length + 1 + (showYearTotal ? 1 : 0);
                        const td = "p-1.5 border border-gray-300 text-right tabular-nums text-[11px]";

                        const renderRows = (label: string, bgClass: string, rows: typeof data.total, yearData: typeof data.total) => {
                            const sub = (fn: (r: typeof rows[0]) => number) => rows.reduce((s, r) => s + fn(r), 0);
                            const yr = (fn: (r: typeof yearData[0]) => number) => yearData.reduce((s, r) => s + fn(r), 0);
                            const subA = sub(r => r.actual), subT = sub(r => r.target), subL = sub(r => r.lastYear);
                            const yrA = yr(r => r.actual), yrT = yr(r => r.target), yrL = yr(r => r.lastYear);
                            return (
                                <React.Fragment>
                                    <tr><td colSpan={colCount} className={`p-1.5 border border-gray-400 font-bold text-[12px] text-white ${bgClass}`}>{label}</td></tr>
                                    <tr className="text-gray-600">
                                        <td className={`${td} text-[10px]`}>前年度</td>
                                        {rows.map(r => <td key={`ly-${label}-${r.month}`} className={td}>{r.lastYear.toLocaleString()}</td>)}
                                        <td className={`${td} bg-gray-50 font-medium`}>{subL.toLocaleString()}</td>
                                        {showYearTotal && <td className={`${td} bg-gray-100 font-bold`}>{yrL.toLocaleString()}</td>}
                                    </tr>
                                    <tr className="text-blue-700">
                                        <td className={`${td} text-[10px]`}>目標</td>
                                        {rows.map(r => <td key={`tg-${label}-${r.month}`} className={td}>{r.target.toLocaleString()}</td>)}
                                        <td className={`${td} bg-gray-50 font-medium`}>{subT.toLocaleString()}</td>
                                        {showYearTotal && <td className={`${td} bg-gray-100 font-bold`}>{yrT.toLocaleString()}</td>}
                                    </tr>
                                    <tr style={{ backgroundColor: '#fffbeb' }}>
                                        <td className={`${td} text-[10px] font-bold`}>実績</td>
                                        {rows.map(r => <td key={`ac-${label}-${r.month}`} className={`${td} font-bold`}>{r.actual.toLocaleString()}</td>)}
                                        <td className={`${td} bg-gray-50 font-bold`}>{subA.toLocaleString()}</td>
                                        {showYearTotal && <td className={`${td} bg-gray-100 font-bold`}>{yrA.toLocaleString()}</td>}
                                    </tr>
                                    <tr>
                                        <td className={`${td} text-[9px]`}>達成率</td>
                                        {rows.map(r => { const rt = r.target > 0 ? (r.actual / r.target) * 100 : 0; return <td key={`rt-${label}-${r.month}`} className={`${td} text-[10px] ${getRateStyle(rt, r.actual)}`}>{r.target > 0 ? formatPercent(rt) : '-'}</td> })}
                                        {(() => { const rt = subT > 0 ? (subA / subT) * 100 : 0; return <td className={`${td} bg-gray-50 text-[10px] ${getRateStyle(rt)}`}>{subT > 0 ? formatPercent(rt) : '-'}</td> })()}
                                        {showYearTotal && (() => { const rt = yrT > 0 ? (yrA / yrT) * 100 : 0; return <td className={`${td} bg-gray-100 text-[10px] ${getRateStyle(rt)}`}>{yrT > 0 ? formatPercent(rt) : '-'}</td> })()}
                                    </tr>
                                    <tr>
                                        <td className={`${td} text-[9px]`}>前年比</td>
                                        {rows.map(r => { const rt = r.lastYear > 0 ? (r.actual / r.lastYear) * 100 : 0; return <td key={`yoy-${label}-${r.month}`} className={`${td} text-[10px]`}>{r.actual > 0 && r.lastYear > 0 ? formatPercent(rt) : '-'}</td> })}
                                        {(() => { const rt = subL > 0 ? (subA / subL) * 100 : 0; return <td className={`${td} bg-gray-50 text-[10px]`}>{subA > 0 && subL > 0 ? formatPercent(rt) : '-'}</td> })()}
                                        {showYearTotal && (() => { const rt = yrL > 0 ? (yrA / yrL) * 100 : 0; return <td className={`${td} bg-gray-100 text-[10px]`}>{yrA > 0 && yrL > 0 ? formatPercent(rt) : '-'}</td> })()}
                                    </tr>
                                </React.Fragment>
                            );
                        };

                        return (
                            <table className="w-full border-collapse border border-gray-300 mb-3">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="p-1.5 border border-gray-300 text-right text-[11px] w-[60px]">内訳</th>
                                        {months.map(m => (
                                            <th key={m} className="p-1.5 border border-gray-300 text-right text-[11px]">
                                                {new Date(m).getMonth() + 1}月
                                            </th>
                                        ))}
                                        <th className="p-1.5 border border-gray-300 text-right text-[11px] bg-gray-200 font-bold">{halfLabel}</th>
                                        {showYearTotal && <th className="p-1.5 border border-gray-300 text-right text-[11px] bg-gray-300 font-bold">年間計</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {channelList.map(({ code, label }) => {
                                        const rowData = data.channels[code];
                                        const halfRows = monthIndices.map(i => rowData[i]);
                                        return <React.Fragment key={code}>{renderRows(label, 'bg-slate-600', halfRows, rowData)}</React.Fragment>;
                                    })}
                                    {renderRows('★ 総合計', 'bg-slate-800', monthIndices.map(i => data.total[i]), data.total)}
                                </tbody>
                            </table>
                        );
                    };


                    const renderPrintSubTable = (title: string, bgColor: string, dataRows: { month: string; target: number; actual: number }[], monthIndices: number[], halfLabel: string, showYearTotal: boolean) => {
                        const td = "p-1.5 border border-gray-300 text-right tabular-nums text-[11px]";
                        const halfData = monthIndices.map(i => dataRows[i]);
                        const subT = halfData.reduce((s, r) => s + r.target, 0);
                        const subA = halfData.reduce((s, r) => s + r.actual, 0);
                        const yrT = dataRows.reduce((s, r) => s + r.target, 0);
                        const yrA = dataRows.reduce((s, r) => s + r.actual, 0);
                        const months = monthIndices.map(i => data.months[i]);
                        return (
                            <div className="mt-4">
                                <h3 className="text-sm font-bold mb-1">{title}</h3>
                                <table className="w-full border-collapse border border-gray-300">
                                    <thead>
                                        <tr className={bgColor}>
                                            <th className="p-1.5 border border-gray-300 text-right text-[11px] w-[60px]">内訳</th>
                                            {months.map(m => <th key={m} className="p-1.5 border border-gray-300 text-right text-[11px]">{new Date(m).getMonth() + 1}月</th>)}
                                            <th className="p-1.5 border border-gray-300 text-right text-[11px] bg-gray-200 font-bold">{halfLabel}</th>
                                            {showYearTotal && <th className="p-1.5 border border-gray-300 text-right text-[11px] bg-gray-300 font-bold">年間計</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="text-blue-700">
                                            <td className={`${td} text-[10px]`}>目標</td>
                                            {halfData.map(r => <td key={`st-${r.month}`} className={td}>{r.target.toLocaleString()}</td>)}
                                            <td className={`${td} bg-gray-50 font-medium`}>{subT.toLocaleString()}</td>
                                            {showYearTotal && <td className={`${td} bg-gray-100 font-bold`}>{yrT.toLocaleString()}</td>}
                                        </tr>
                                        <tr style={{ backgroundColor: '#fffbeb' }}>
                                            <td className={`${td} text-[10px] font-bold`}>実績</td>
                                            {halfData.map(r => <td key={`sa-${r.month}`} className={`${td} font-bold`}>{r.actual.toLocaleString()}</td>)}
                                            <td className={`${td} bg-gray-50 font-bold`}>{subA.toLocaleString()}</td>
                                            {showYearTotal && <td className={`${td} bg-gray-100 font-bold`}>{yrA.toLocaleString()}</td>}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        );
                    };

                    return (
                        <div className="hidden print:block">
                            {/* Page 1: First Half (Aug-Jan) */}
                            <div>
                                <h2 className="text-base font-bold mb-2">月次・部門別集計 ─ 上期（8月〜1月）</h2>
                                {renderPrintHalf([0, 1, 2, 3, 4, 5], '上期計', false)}

                                {data.salesActivity && data.salesActivity.length > 0 && renderPrintSubTable('営業活動実績（新規・OEM獲得数）', 'bg-orange-50', data.salesActivity, [0,1,2,3,4,5], '上期計', false)}
                                {data.manufacturing && data.manufacturing.length > 0 && renderPrintSubTable('商品製造数', 'bg-blue-50', data.manufacturing, [0,1,2,3,4,5], '上期計', false)}
                            </div>

                            {/* Page 2: Second Half (Feb-Jul) + Year Total */}
                            <div style={{ breakBefore: 'page' }}>
                                <h2 className="text-base font-bold mb-2">月次・部門別集計 ─ 下期（2月〜7月）</h2>
                                {renderPrintHalf([6, 7, 8, 9, 10, 11], '下期計', true)}

                                {/* Sales Activity & Manufacturing for print - 下期 */}
                                {data.salesActivity && data.salesActivity.length > 0 && renderPrintSubTable('営業活動実績（新規・OEM獲得数）', 'bg-orange-50', data.salesActivity, [6,7,8,9,10,11], '下期計', true)}
                                {data.manufacturing && data.manufacturing.length > 0 && renderPrintSubTable('商品製造数', 'bg-blue-50', data.manufacturing, [6,7,8,9,10,11], '下期計', true)}
                            </div>
                        </div>
                    );
                })()}

            </div>
        </>
    );
}
