// components/daily-sales-crud-form.tsx

"use client";

import { useState, useEffect } from 'react';
import { createAuthenticatedSupabaseClient } from '@/lib/supabase';
import { nf } from '@/lib/utils'; // ★nfをインポート

// Propsの型定義
interface DailySalesCrudFormProps {
    selectedDate: string;
    dailyData: any; // get_sales_report_dataの返り値を想定
    onDataUpdate: () => void;
    accessToken: string | null;
}

// フォームの入力フィールド
const formFields = [
    { id: 'floor_sales', label: 'フロア日計', type: 'number' },
    { id: 'cash_income', label: '入金', type: 'number' },
    { id: 'register_count', label: 'レジ通過人数', type: 'number' },
    { id: 'amazon_amount', label: 'Amazon 売上', type: 'number' },
    { id: 'amazon_count', label: 'Amazon 件数', type: 'number' },
    { id: 'base_amount', label: 'BASE 売上', type: 'number' },
    { id: 'base_count', label: 'BASE 件数', type: 'number' },
    { id: 'yahoo_amount', label: 'Yahoo! 売上', type: 'number' },
    { id: 'yahoo_count', label: 'Yahoo! 件数', type: 'number' },
    { id: 'mercari_amount', label: 'メルカリ 売上', type: 'number' },
    { id: 'mercari_count', label: 'メルカリ 件数', type: 'number' },
    { id: 'rakuten_amount', label: '楽天 売上', type: 'number' },
    { id: 'rakuten_count', label: '楽天 件数', type: 'number' },
    { id: 'qoo10_amount', label: 'Qoo10 売上', type: 'number' },
    { id: 'qoo10_count', label: 'Qoo10 件数', type: 'number' },
];

export default function DailySalesCrudForm({ selectedDate, dailyData, onDataUpdate, accessToken }: DailySalesCrudFormProps) {
    const [formData, setFormData] = useState<any>({});
    const [message, setMessage] = useState('');

    useEffect(() => {
        // dailyDataからフォームの初期値を設定
        const initialFormData: any = {};
        formFields.forEach(field => {
            initialFormData[field.id] = dailyData?.[`d_${field.id}`] ?? '';
        });
        setFormData(initialFormData);
    }, [dailyData, selectedDate]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        setFormData({ ...formData, [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value });
    };

    const handleSave = async () => {
        if (!accessToken) { setMessage('エラー: 認証トークンがありません'); return; }
        const supabase = createAuthenticatedSupabaseClient(accessToken);
        const dataToSave = { date: selectedDate, ...formData };
        
        // 空文字のフィールドをnullに変換
        for(const key in dataToSave) {
            if (dataToSave[key] === '') {
                dataToSave[key] = null;
            }
        }

        const { error } = await supabase.from('daily_sales_report').upsert(dataToSave, { onConflict: 'date' });
        if (error) {
            setMessage(`保存に失敗しました: ${error.message}`);
        } else {
            setMessage(`${selectedDate}のデータを保存しました。`);
            onDataUpdate(); // 親コンポーネントに更新を通知
        }
    };
    
    const handleDelete = async () => {
        if (!accessToken) { setMessage('エラー: 認証トークンがありません'); return; }
        if (!confirm(`${selectedDate}のデータを本当に削除しますか？`)) return;

        const supabase = createAuthenticatedSupabaseClient(accessToken);
        const { error } = await supabase.from('daily_sales_report').delete().eq('date', selectedDate);

        if (error) {
            setMessage(`削除に失敗しました: ${error.message}`);
        } else {
            setMessage(`${selectedDate}のデータを削除しました。`);
            onDataUpdate(); // 親コンポーネントに更新を通知
        }
    };

    const handleGenerateReport = () => {
        // const nf = (num: number) => num ? num.toLocaleString() : '0'; // ★この行を削除
        const d = dailyData;
        
        const reportText = `【会津ブランド館売上報告】
${selectedDate}
フロア日計 / ${nf(d.d_floor_sales).padStart(8, ' ')}円
フロア累計 / ${nf(d.m_floor_total).padStart(8, ' ')}円
入 金 / ${nf(d.d_cash_income).padStart(8, ' ')} 円
レジ通過人数 / ${nf(d.d_register_count).padStart(3, ' ')} 人
【WEB売上】
Amazon 売上 / ${nf(d.d_amazon_count)}件  ${nf(d.d_amazon_amount)}円
BASE 売上 / ${nf(d.d_base_count)}件  ${nf(d.d_base_amount)}円
Yahoo! 売上 / ${nf(d.d_yahoo_count)}件  ${nf(d.d_yahoo_amount)}円
メルカリ 売上 / ${nf(d.d_mercari_count)}件  ${nf(d.d_mercari_amount)}円
楽天 売上 / ${nf(d.d_rakuten_count)}件  ${nf(d.d_rakuten_amount)}円
Qoo10 売上 / ${nf(d.d_qoo10_count)}件  ${nf(d.d_qoo10_amount)}円
Amazon累計/  ${nf(d.m_amazon_total)}円
BASE累計/  ${nf(d.m_base_total)}円
Yahoo!累計/  ${nf(d.m_yahoo_total)}円
メルカリ累計/  ${nf(d.m_mercari_total)}円
楽天累計/  ${nf(d.m_rakuten_total)}円
Qoo10累計/  ${nf(d.m_qoo10_total)}円
---------------------------------------
WEB売上累計 / ${nf(d.m_web_total)}円
【月内フロア＋WEB累計売上】
${nf(d.m_grand_total)}円`;

        navigator.clipboard.writeText(reportText).then(() => {
            setMessage('帳票をクリップボードにコピーしました。');
        }, () => {
            setMessage('クリップボードへのコピーに失敗しました。');
        });
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {formFields.map(field => (
                    <div key={field.id}>
                        <label htmlFor={field.id} className="block text-sm font-medium text-gray-700">{field.label}</label>
                        <input
                            type={field.type}
                            name={field.id}
                            id={field.id}
                            value={formData[field.id] ?? ''}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-between">
                <div>
                    <button onClick={handleSave} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">登録・更新</button>
                    <button onClick={handleDelete} className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded ml-2">削除</button>
                    <button onClick={handleGenerateReport} className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded ml-2">帳票をコピー</button>
                </div>
                {message && <p className="text-sm text-gray-600">{message}</p>}
            </div>
        </div>
    );
}
