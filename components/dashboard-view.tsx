// /components/dashboard-view.tsx ver.2 APIルート経由版

"use client";

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "next-auth/react";

import DashboardHeader from './dashboard-header';
import DashboardStats from './dashboard-stats';
import SalesChartGrid from './sales-chart-grid';
import DailySalesCrudForm from './daily-sales-crud-form';
import AiDashboardSection from './ai-dashboard-section';

export default function DashboardView() {
    const { data: session } = useSession();
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    
    // データステート
    const [dailyData, setDailyData] = useState<any>(null);
    const [monthlyData, setMonthlyData] = useState<any>(null);
    const [sixMonthData, setSixMonthData] = useState<any[]>([]);
    
    // ローディング・エラーステート
    const [dailyLoading, setDailyLoading] = useState(true);
    const [graphLoading, setGraphLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const getDailyData = useCallback(async (date: Date) => {
        setDailyLoading(true);
        // タイムゾーン問題を完全に回避するローカル日付文字列生成
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        try {
            const response = await fetch(`/api/sales/daily?date=${dateString}`);
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'データ取得に失敗しました');
            }
            
            const result = await response.json();
            setDailyData(result.data || {});
        } catch (err: any) {
            throw new Error(`日次データ取得エラー: ${err.message}`);
        } finally {
            setDailyLoading(false);
        }
    }, []);

    const getMonthlyData = useCallback(async (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        try {
            const response = await fetch(`/api/sales/monthly?date=${dateString}`);
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'データ取得に失敗しました');
            }
            
            const result = await response.json();
            setMonthlyData(result.data || {});
        } catch (err: any) {
            throw new Error(`月累計データ取得エラー: ${err.message}`);
        }
    }, []);
    
    const getSixMonthData = useCallback(async (date: Date) => {
        setGraphLoading(true);
        const dateString = date.toISOString().split('T')[0];
        
        try {
            const response = await fetch(`/api/sales/six-month?date=${dateString}`);
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'データ取得に失敗しました');
            }
            
            const result = await response.json();
            setSixMonthData(result.data || []);
        } catch (err: any) {
            throw new Error(`グラフデータ取得エラー: ${err.message}`);
        } finally {
            setGraphLoading(false);
        }
    }, []);

    const fetchData = useCallback(async (date: Date) => {
        if (!session) return; // セッションがない場合は何もしない
        setError(null);
        try {
            // 3つのデータ取得を並行して実行
            await Promise.all([
                getDailyData(date),
                getMonthlyData(date),
                getSixMonthData(date)
            ]);
        } catch (err: any) {
            setError(err.message);
            console.error(err);
            setDailyLoading(false);
            setGraphLoading(false);
        }
    }, [session, getDailyData, getMonthlyData, getSixMonthData]);

    useEffect(() => {
        fetchData(selectedDate);
    }, [selectedDate, session]); // sessionの変更でも再取得

    const handleDataUpdate = () => {
        fetchData(selectedDate);
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 bg-slate-50 min-h-screen font-sans">
            <DashboardHeader selectedDate={selectedDate} onDateChange={setSelectedDate} />
            
            <main className="mt-6 space-y-8">
                {error && <p className="text-red-500">{error}</p>}
                
                <DashboardStats data={dailyData} monthlyData={monthlyData} isLoading={dailyLoading} />
                
                <SalesChartGrid data={sixMonthData} isLoading={graphLoading} />

                <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-200">
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
                            accessToken={session.supabaseAccessToken}
                        />
                    )}
                </div>

                {/* ダッシュボード下部にAI分析セクションを追加 */}
                <AiDashboardSection />
            </main>
        </div>
    );
}
