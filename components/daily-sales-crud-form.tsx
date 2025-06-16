"use client";

import { useState, useEffect } from 'react';
import { createAuthenticatedSupabaseClient } from '@/lib/supabase';
import { nf } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface DailySalesCrudFormProps {
    selectedDate: string;
    dailyData: any;
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

export default function DailySalesCrudForm({ selectedDate, dailyData, onDataUpdate, accessToken }: DailySalesCrudFormProps) {
    const [formData, setFormData] = useState<any>({});

    useEffect(() => {
        // 修正: 直接テーブルから取得したデータ構造に対応
        const initialFormData: any = {
            floor_sales: dailyData?.floor_sales ?? '',
            cash_income: dailyData?.cash_income ?? '',
            register_count: dailyData?.register_count ?? '',
            amazon_count: dailyData?.amazon_count ?? '',
            base_count: dailyData?.base_count ?? '',
            yahoo_count: dailyData?.yahoo_count ?? '',
            mercari_count: dailyData?.mercari_count ?? '',
            rakuten_count: dailyData?.rakuten_count ?? '',
            qoo10_count: dailyData?.qoo10_count ?? '',
            amazon_amount: dailyData?.amazon_amount ?? '',
            base_amount: dailyData?.base_amount ?? '',
            yahoo_amount: dailyData?.yahoo_amount ?? '',
            mercari_amount: dailyData?.mercari_amount ?? '',
            rakuten_amount: dailyData?.rakuten_amount ?? '',
            qoo10_amount: dailyData?.qoo10_amount ?? '',
        };
        setFormData(initialFormData);
    }, [dailyData]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value === '' ? '' : Number(value) });
    };

    const handleSave = async () => {
        if (!accessToken) { toast.error('エラー: 認証トークンがありません'); return; }
        const supabase = createAuthenticatedSupabaseClient(accessToken);
        const dataToSave = { date: selectedDate, ...formData };
        for(const key in dataToSave) { if (dataToSave[key] === '') { dataToSave[key] = null; } }
        const { error } = await supabase.from('daily_sales_report').upsert(dataToSave, { onConflict: 'date' });
        if (error) { toast.error(`保存に失敗しました: ${error.message}`); } 
        else { toast.success(`${selectedDate}のデータを保存しました。`); onDataUpdate(); }
    };

    const handleDelete = async () => {
        if (!accessToken) { toast.error('エラー: 認証トークンがありません'); return; }
        if (!confirm(`${selectedDate}のデータを本当に削除しますか？`)) return;
        const supabase = createAuthenticatedSupabaseClient(accessToken);
        const { error } = await supabase.from('daily_sales_report').delete().eq('date', selectedDate);
        if (error) { toast.error(`削除に失敗しました: ${error.message}`); } 
        else { toast.success(`${selectedDate}のデータを削除しました。`); onDataUpdate(); }
    };

    const handleGenerateReport = () => {
        const d = dailyData;
        
        if (!d) {
            toast.error("帳票を生成するデータがありません。");
            return;
        }

        const reportText = `【会津ブランド館売上報告】
${selectedDate}
フロア日計 / ${nf(d.floor_sales || 0).padStart(8, ' ')}円
入 金 / ${nf(d.cash_income || 0).padStart(8, ' ')} 円
レジ通過人数 / ${nf(d.register_count || 0).padStart(3, ' ')} 人
【WEB売上】
Amazon 売上 / ${nf(d.amazon_count || 0)}件  ${nf(d.amazon_amount || 0)}円
BASE 売上 / ${nf(d.base_count || 0)}件  ${nf(d.base_amount || 0)}円
Yahoo! 売上 / ${nf(d.yahoo_count || 0)}件  ${nf(d.yahoo_amount || 0)}円
メルカリ 売上 / ${nf(d.mercari_count || 0)}件  ${nf(d.mercari_amount || 0)}円
楽天 売上 / ${nf(d.rakuten_count || 0)}件  ${nf(d.rakuten_amount || 0)}円
Qoo10 売上 / ${nf(d.qoo10_count || 0)}件  ${nf(d.qoo10_amount || 0)}円`;

        navigator.clipboard.writeText(reportText).then(() => {
            toast.success("帳票をクリップボードにコピーしました！");
        }, () => {
            toast.error("クリップボードへのコピーに失敗しました。");
        });
    };

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                    <FormInput id="floor_sales" label="フロア日計" value={formData.floor_sales ?? ''} onChange={handleChange} />
                    <FormInput id="cash_income" label="入金" value={formData.cash_income ?? ''} onChange={handleChange} />
                    <FormInput id="register_count" label="レジ通過人数" value={formData.register_count ?? ''} onChange={handleChange} />
                </div>
                <div className="grid grid-cols-6 gap-4">
                    <FormInput id="amazon_count" label="Amazon 件数" value={formData.amazon_count ?? ''} onChange={handleChange} />
                    <FormInput id="base_count" label="BASE 件数" value={formData.base_count ?? ''} onChange={handleChange} />
                    <FormInput id="yahoo_count" label="Yahoo! 件数" value={formData.yahoo_count ?? ''} onChange={handleChange} />
                    <FormInput id="mercari_count" label="メルカリ 件数" value={formData.mercari_count ?? ''} onChange={handleChange} />
                    <FormInput id="rakuten_count" label="楽天 件数" value={formData.rakuten_count ?? ''} onChange={handleChange} />
                    <FormInput id="qoo10_count" label="Qoo10 件数" value={formData.qoo10_count ?? ''} onChange={handleChange} />
                </div>
                <div className="grid grid-cols-6 gap-4">
                     <FormInput id="amazon_amount" label="Amazon 売上" value={formData.amazon_amount ?? ''} onChange={handleChange} />
                    <FormInput id="base_amount" label="BASE 売上" value={formData.base_amount ?? ''} onChange={handleChange} />
                    <FormInput id="yahoo_amount" label="Yahoo! 売上" value={formData.yahoo_amount ?? ''} onChange={handleChange} />
                    <FormInput id="mercari_amount" label="メルカリ 売上" value={formData.mercari_amount ?? ''} onChange={handleChange} />
                    <FormInput id="rakuten_amount" label="楽天 売上" value={formData.rakuten_amount ?? ''} onChange={handleChange} />
                    <FormInput id="qoo10_amount" label="Qoo10 売上" value={formData.qoo10_amount ?? ''} onChange={handleChange} />
                </div>
            </div>

            <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                    <Button onClick={handleSave}>登録・更新</Button>
                    <Button variant="destructive" onClick={handleDelete}>削除</Button>
                    <Button variant="secondary" onClick={handleGenerateReport}>帳票を生成</Button>
                </div>
            </div>
        </div>
    );
}
