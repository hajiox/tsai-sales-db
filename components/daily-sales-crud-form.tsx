// components/daily-sales-crud-form.tsx ver.2
"use client";

import { useState, useEffect } from 'react';
import { createAuthenticatedSupabaseClient } from '@/lib/supabase';
import { nf } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface TsgPoster {
    id: string;
    displayName: string;
    pictureUrl: string | null;
    role?: string | null;
    groupRole?: string | null;
}

interface DailySalesCrudFormProps {
    selectedDate: string;
    dailyData: any;
    monthlyData: any;
    onDataUpdate: () => void;
    accessToken: string | null;
}

const FormInput = ({ id, label, value, onChange }: { id: string, label: string, value: any, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
        <Input
            type="number"
            name={id}
            id={id}
            value={value}
            onChange={onChange}
            className="bg-white"
        />
    </div>
);

const getTsgPosterLabel = (poster: TsgPoster) =>
    poster.role === 'admin' || poster.groupRole === 'admin'
        ? `${poster.displayName}（管理者）`
        : poster.displayName;

const toNumber = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const buildStoreReportText = (selectedDate: string, daily: any, monthly: any) => `【会津ブランド館売上報告】
${selectedDate}

フロア日計 / ${nf(toNumber(daily.floor_sales))}円
入金 / ${nf(toNumber(daily.cash_income))}円
レジ通過人数 / ${nf(toNumber(daily.register_count))}人

累計売上 / ${nf(toNumber(monthly.m_floor_total))}円
累計レジ通過人数 / ${nf(toNumber(monthly.m_register_count_total))}人`;

export default function DailySalesCrudForm({ selectedDate, dailyData, monthlyData, onDataUpdate, accessToken }: DailySalesCrudFormProps) {
    const [formData, setFormData] = useState<any>({});
    const [tsgPosters, setTsgPosters] = useState<TsgPoster[]>([]);
    const [selectedTsgPosterId, setSelectedTsgPosterId] = useState('');
    const [loadingTsgPosters, setLoadingTsgPosters] = useState(true);
    const [tsgPosterError, setTsgPosterError] = useState<string | null>(null);
    const [postingReport, setPostingReport] = useState(false);
    const [reportSubmitted, setReportSubmitted] = useState(false);

    useEffect(() => {
        const initialFormData: any = {
            floor_sales: dailyData?.floor_sales ?? '',
            cash_income: dailyData?.cash_income ?? '',
            register_count: dailyData?.register_count ?? '',
        };
        setFormData(initialFormData);
    }, [dailyData]);

    useEffect(() => {
        let active = true;
        setLoadingTsgPosters(true);

        fetch('/api/tsg/daily-report/users', { cache: 'no-store' })
            .then(async (res) => {
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(payload.error || 'TSG投稿者一覧の取得に失敗しました');
                return payload.users || [];
            })
            .then((users: TsgPoster[]) => {
                if (!active) return;
                setTsgPosters(users);
                const savedPosterId = window.localStorage.getItem('tsaSalesReportTsgPosterId') || '';
                if (savedPosterId && users.some(user => user.id === savedPosterId)) {
                    setSelectedTsgPosterId(savedPosterId);
                } else if (users.length === 1) {
                    setSelectedTsgPosterId(users[0].id);
                }
                setTsgPosterError(null);
            })
            .catch((err) => {
                if (!active) return;
                setTsgPosterError(err instanceof Error ? err.message : String(err));
            })
            .finally(() => {
                if (active) setLoadingTsgPosters(false);
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        setReportSubmitted(false);
    }, [selectedDate, formData, selectedTsgPosterId]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value === '' ? '' : Number(value) });
    };

    const saveFormData = async () => {
        if (!accessToken) throw new Error('エラー: 認証トークンがありません');
        const supabase = createAuthenticatedSupabaseClient(accessToken);
        const dataToSave = { date: selectedDate, ...formData };
        for(const key in dataToSave) { if (dataToSave[key] === '') { dataToSave[key] = null; } }
        const { error } = await supabase.from('daily_sales_report').upsert(dataToSave, { onConflict: 'date' });
        if (error) throw new Error(`保存に失敗しました: ${error.message}`);
        return dataToSave;
    };

    const handleSave = async () => {
        try {
            await saveFormData();
            toast.success(`${selectedDate}のデータを保存しました。`);
            onDataUpdate();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '保存に失敗しました');
        }
    };

    const handleDelete = async () => {
        if (!accessToken) { toast.error('エラー: 認証トークンがありません'); return; }
        if (!confirm(`${selectedDate}のデータを本当に削除しますか？`)) return;
        const supabase = createAuthenticatedSupabaseClient(accessToken);
        const { error } = await supabase.from('daily_sales_report').delete().eq('date', selectedDate);
        if (error) { toast.error(`削除に失敗しました: ${error.message}`); } 
        else { toast.success(`${selectedDate}のデータを削除しました。`); onDataUpdate(); }
    };

    const fetchLatestMonthlyData = async () => {
        const response = await fetch(`/api/sales/monthly?date=${selectedDate}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || '月累計データの再取得に失敗しました');
        }
        return payload.data || monthlyData || {};
    };

    const handleGenerateReport = async () => {
        if (!selectedTsgPosterId) {
            toast.error('TSGへ投稿する名義を選択してください');
            return;
        }

        setPostingReport(true);
        try {
            const savedDailyData = await saveFormData();
            const latestMonthlyData = await fetchLatestMonthlyData();
            const reportText = buildStoreReportText(selectedDate, savedDailyData, latestMonthlyData);

            const response = await fetch('/api/tsg/daily-report/post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: selectedTsgPosterId, content: reportText }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || 'TSGへの投稿に失敗しました');
            }

            setReportSubmitted(true);
            toast.success('TSGへ売上報告を投稿しました。');
            onDataUpdate();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '帳票の投稿に失敗しました');
        } finally {
            setPostingReport(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                    <FormInput id="floor_sales" label="フロア日計" value={formData.floor_sales ?? ''} onChange={handleChange} />
                    <FormInput id="cash_income" label="入金" value={formData.cash_income ?? ''} onChange={handleChange} />
                    <FormInput id="register_count" label="レジ通過人数" value={formData.register_count ?? ''} onChange={handleChange} />
                </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div className="min-w-[240px] flex-1">
                        <label className="mb-1 block text-sm font-medium text-slate-600">TSG投稿者</label>
                        <select
                            value={selectedTsgPosterId}
                            onChange={(event) => {
                                setSelectedTsgPosterId(event.target.value);
                                if (event.target.value) {
                                    window.localStorage.setItem('tsaSalesReportTsgPosterId', event.target.value);
                                } else {
                                    window.localStorage.removeItem('tsaSalesReportTsgPosterId');
                                }
                            }}
                            disabled={loadingTsgPosters || tsgPosters.length === 0}
                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500 disabled:opacity-50"
                            aria-label="TSG投稿者"
                        >
                            <option value="">{loadingTsgPosters ? 'TSG投稿者を読込中' : 'TSG投稿者を選択'}</option>
                            {tsgPosters.map(poster => (
                                <option key={poster.id} value={poster.id}>
                                    {getTsgPosterLabel(poster)}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-slate-500">投稿先: TS(売上・新規・HAPPY！)</p>
                        {tsgPosterError && <p className="mt-1 text-xs text-red-600">{tsgPosterError}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            onClick={handleGenerateReport}
                            disabled={postingReport || loadingTsgPosters}
                        >
                            {reportSubmitted ? '投稿済み' : postingReport ? '投稿中...' : '帳票を生成・投稿'}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                    <Button onClick={handleSave}>登録・更新</Button>
                    <Button variant="destructive" onClick={handleDelete}>削除</Button>
                </div>
            </div>
        </div>
    );
}
