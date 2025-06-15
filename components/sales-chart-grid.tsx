"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ChartCard = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <Card className="shadow-sm border-slate-200">
        <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-700">{title}</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
             {children}
        </CardContent>
    </Card>
);

export default function SalesChartGrid({ data, isLoading }: { data: any[], isLoading: boolean }) {
    if (isLoading) {
        return <div className="grid md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-80 bg-slate-200 rounded-lg animate-pulse"></div>)}
        </div>
    }

    const formatYAxis = (tick: any) => `${(tick / 1000).toLocaleString()}k`;

    return (
        <div className="grid md:grid-cols-2 gap-4">
            <ChartCard title="① 店舗売上 (過去6ヶ月)">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month_label" fontSize={12} />
                        <YAxis tickFormatter={formatYAxis} fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="floor_sales_total" fill="#64748b" name="店舗売上" />
                    </BarChart>
                </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="② ECサイト別売上 (過去6ヶ月)">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month_label" fontSize={12} />
                        <YAxis tickFormatter={formatYAxis} fontSize={12} />
                        <Tooltip />
                        <Legend wrapperStyle={{fontSize: "12px"}}/>
                        <Line type="monotone" dataKey="amazon_sales" stroke="#ff9900" name="Amazon"/>
                        <Line type="monotone" dataKey="rakuten_sales" stroke="#bf0000" name="楽天"/>
                        <Line type="monotone" dataKey="yahoo_sales" stroke="#ff0033" name="Yahoo!"/>
                        {/* ★ ここからが追加分 */}
                        <Line type="monotone" dataKey="mercari_sales" stroke="#5a9bff" name="メルカリ"/>
                        <Line type="monotone" dataKey="base_sales" stroke="#2ecc71" name="BASE"/>
                        <Line type="monotone" dataKey="qoo10_sales" stroke="#f1c40f" name="Qoo10"/>
                    </LineChart>
                </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="③ EC合計売上 (過去6ヶ月)">
                <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month_label" fontSize={12} />
                        <YAxis tickFormatter={formatYAxis} fontSize={12}/>
                        <Tooltip />
                        <Bar dataKey="ec_sales_total" fill="#0f172a" name="EC合計売上" />
                    </BarChart>
                </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="④ EC販売個数合計 (過去6ヶ月)">
                 <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month_label" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="ec_count_total" fill="#334155" name="EC販売個数" />
                    </BarChart>
                </ResponsiveContainer>
            </ChartCard>
        </div>
    );
}
