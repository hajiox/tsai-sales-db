
'use client';

import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, BarChart } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
interface MonthlyData {
    month: string;
    actual: number;
    target: number;
    lastYear: number;
    twoYearsAgo: number;
    // Channel breakdowns for stacked
    WEB?: number;
    WHOLESALE?: number;
    STORE?: number;
    SHOKU?: number;
}

interface KpiChartsProps {
    data: MonthlyData[];
    fiscalYear: number;
}

const formatYAxis = (value: number) => {
    return new Intl.NumberFormat('ja-JP', { notation: "compact", compactDisplay: "short" }).format(value);
};

const formatTooltip = (value: number) => {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value);
};

const formatXAxis = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}月`;
};

export function KpiMainChart({ data, fiscalYear }: KpiChartsProps) {
    return (
        <Card className="col-span-1 shadow-sm">
            <CardHeader>
                <CardTitle className="text-base font-medium flex items-center justify-between">
                    <span>売上実績 vs 目標 vs 前年 (FY{fiscalYear})</span>
                    <div className="flex gap-2">
                        <span className="px-2 py-0.5 rounded text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">実績</span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium border bg-green-50 text-green-700 border-green-200">目標</span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium border bg-gray-50 text-gray-500 border-gray-200">前年</span>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            <XAxis
                                dataKey="month"
                                tickFormatter={formatXAxis}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#6b7280' }}
                                dy={10}
                            />
                            <YAxis
                                tickFormatter={formatYAxis}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#6b7280' }}
                            />
                            <Tooltip
                                formatter={formatTooltip}
                                labelFormatter={(label) => formatXAxis(label as string)}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend />
                            <Bar dataKey="actual" name="実績" barSize={30} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            <Line type="monotone" dataKey="target" name="目標" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                            <Line type="monotone" dataKey="lastYear" name="前年" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}

export function KpiChannelChart({ data, fiscalYear }: KpiChartsProps) {
    return (
        <Card className="col-span-1 shadow-sm">
            <CardHeader>
                <CardTitle className="text-base font-medium">チャネル別売上構成 (FY{fiscalYear})</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            <XAxis
                                dataKey="month"
                                tickFormatter={formatXAxis}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#6b7280' }}
                                dy={10}
                            />
                            <YAxis
                                tickFormatter={formatYAxis}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#6b7280' }}
                            />
                            <Tooltip
                                formatter={formatTooltip}
                                labelFormatter={(label) => formatXAxis(label as string)}
                                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend />
                            <Bar stackId="a" dataKey="WEB" name="Web" fill="#8b5cf6" />
                            <Bar stackId="a" dataKey="WHOLESALE" name="卸・OEM" fill="#f59e0b" />
                            <Bar stackId="a" dataKey="STORE" name="店舗" fill="#ec4899" />
                            <Bar stackId="a" dataKey="SHOKU" name="食のブランド館" fill="#06b6d4" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
