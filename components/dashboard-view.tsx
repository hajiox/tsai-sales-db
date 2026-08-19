// /components/dashboard-view.tsx ver.8 (URL同期版)

"use client";

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';

import DashboardHeader from './dashboard-header';
import ClientDate from '@/components/common/ClientDate';
import SalesSummaryTable from './sales-summary-table';
import DailySalesCrudForm from './daily-sales-crud-form';
import AiDashboardSection from './ai-dashboard-section';

const SalesChartGrid = dynamic(() => import('./sales-chart-grid'), { ssr: false });
const SalesTop10Summary = dynamic(() => import('./sales-top10-summary'), { ssr: false });

export default function DashboardView() {
    const { data: session } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    
    // URLパラメータから日付を取得、なければ今日の日付
    const getInitialDate = () => {
        const dateParam = searchParams.get('date');
        if (dateParam) {
            const parsed = new Date(dateParam);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        return new Date();
    };
    
    const [selectedDate, setSelectedDate] = useState<Date>(getInitialDate());
    
    // データステート
    const [dailyData, setDailyData] = useState<any>(null);
    const [monthlyData, setMonthlyData] = useState<any>(null);
    const [sixMonthData, setSixMonthData] = useState<any[]>([]);
    
    // ローディング・エラーステート
    const [dailyLoading, setDailyLoading] = useState(true);
    const [graphLoading, setGraphLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 日付が変更されたらURLを更新
    const handleDateChange = (date: Date) => {
        setSelectedDate(date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        router.push(`/sales/dashboard?date=${dateString}`, { scroll: false });
    };

    // 日次データを取得
    const getDailyData = useCallback(async (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        const response = await fetch(`/api/sales/daily?date=${dateString}`, { cache: 'no-store' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '日次データの取得に失敗しました');
        }
        const result = await response.json();
        setDailyData(result.data || {});
    }, []);

    // 月累計データを取得
    const getMonthlyData = useCallback(async (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        const response = await fetch(`/api/sales/monthly?date=${dateString}`, { cache: 'no-store' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '月累計データの取得に失敗しました');
        }
        const result = await response.json();
        setMonthlyData(result.data || {});
    }, []);
    
    // 過去6ヶ月データを取得
    const getSixMonthData = useCallback(async (date: Date) => {
        const dateString = date.toISOString().split('T')[0];
        
        const response = await fetch(`/api/sales/six-month?date=${dateString}`, { cache: 'no-store' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'グラフデータの取得に失敗しました');
        }
        const result = await response.json();
        setSixMonthData(result.data || []);
    }, []);

    // 全てのデータを並行して取得（ローディング処理も一元管理）
    const fetchData = useCallback(async (date: Date) => {
        if (!session) return;
        
        setError(null);
        setDailyLoading(true);
        setGraphLoading(true);

        try {
            await Promise.all([
                getDailyData(date),
                getMonthlyData(date),
                getSixMonthData(date)
            ]);
        } catch (err: any) {
            setError(err.message);
            console.error("データ取得エラー:", err);
        } finally {
            setDailyLoading(false);
            setGraphLoading(false);
        }
    }, [session, getDailyData, getMonthlyData, getSixMonthData]);

    useEffect(() => {
        if (session) {
            fetchData(selectedDate);
        }
    }, [selectedDate, session, fetchData]);

    const handleDataUpdate = () => {
        fetchData(selectedDate);
    };

    return (
        <div className="min-h-screen overflow-x-hidden bg-slate-50 px-3 py-3 font-sans sm:p-4 lg:p-8">
            <div className="mb-1 text-right text-xs text-slate-500 lg:mb-0 lg:text-sm lg:text-slate-600">
                <ClientDate />
            </div>
            <div className="[&_header]:flex-col [&_header]:items-stretch [&_header]:gap-3 [&_h1]:text-xl [&_button]:min-h-11 [&_button]:w-full lg:[&_header]:flex-row lg:[&_header]:items-center lg:[&_header]:gap-0 lg:[&_h1]:text-2xl lg:[&_button]:min-h-0 lg:[&_button]:w-[240px]">
                <DashboardHeader selectedDate={selectedDate} onDateChange={handleDateChange} />
            </div>

            <nav
                aria-label="売上ダッシュボード内メニュー"
                className="mt-4 grid grid-cols-4 overflow-hidden rounded-md border border-slate-200 bg-white text-center text-xs font-semibold text-slate-700 shadow-sm lg:hidden"
            >
                <a className="flex min-h-11 min-w-0 items-center justify-center border-r border-slate-200 px-1 active:bg-slate-100" href="#sales-summary">概要</a>
                <a className="flex min-h-11 min-w-0 items-center justify-center border-r border-slate-200 px-1 active:bg-slate-100" href="#sales-input">売上入力</a>
                <a className="flex min-h-11 min-w-0 items-center justify-center border-r border-slate-200 px-1 active:bg-slate-100" href="#sales-trends">推移</a>
                <a className="flex min-h-11 min-w-0 items-center justify-center px-1 active:bg-slate-100" href="#sales-ai">AI分析</a>
            </nav>
            
            <main className="mt-4 flex min-w-0 flex-col gap-4 lg:mt-6 lg:block lg:space-y-8">
                {error && <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-md"><p className="font-bold">エラーが発生しました:</p><p>{error}</p></div>}

                <section id="sales-summary" className="order-1 min-w-0 scroll-mt-24 lg:order-none">
                    <SalesSummaryTable
                        dailyData={dailyData}
                        monthlyData={monthlyData}
                        isLoading={dailyLoading}
                    />
                </section>

                <section id="sales-trends" className="order-3 min-w-0 scroll-mt-24 lg:order-none">
                    <SalesChartGrid data={sixMonthData} isLoading={graphLoading} />
                </section>

                <section
                    id="sales-input"
                    className="order-2 min-w-0 scroll-mt-24 rounded-lg border border-slate-200 bg-white p-4 shadow-sm [&_.grid.grid-cols-3]:grid-cols-1 [&_.min-w-\[240px\]]:min-w-0 [&_button]:min-h-11 sm:p-6 sm:[&_.grid.grid-cols-3]:grid-cols-3 lg:order-none lg:[&_.min-w-\[240px\]]:min-w-[240px] lg:[&_button]:min-h-0"
                >
                    <h3 className="text-lg font-semibold text-slate-800 mb-4">
                        日次データ操作 ({selectedDate.toLocaleDateString()})
                    </h3>
                    {session && (
                        <DailySalesCrudForm
                            selectedDate={(() => {
                                const year = selectedDate.getFullYear();
                                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                                const day = String(selectedDate.getDate()).padStart(2, '0');
                                return `${year}-${month}-${day}`;
                            })()}
                            dailyData={dailyData}
                            monthlyData={monthlyData}
                            onDataUpdate={handleDataUpdate}
                        />
                    )}
                </section>

                <section className="order-4 min-w-0 lg:order-none [&>div]:p-4 sm:[&>div]:p-6">
                    <SalesTop10Summary />
                </section>

                <section id="sales-ai" className="order-5 min-w-0 scroll-mt-24 lg:order-none [&>div]:p-4 sm:[&>div]:p-6">
                    <AiDashboardSection />
                </section>
            </main>
        </div>
    );
}
