
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { saveKpiTarget } from "@/app/kpi/actions";
import { format } from "date-fns";

interface KpiTargetModalProps {
    isOpen: boolean;
    onClose: () => void;
    fiscalYear: number;
    initialData: { [key: string]: number }; // key: "CHANNEL_YYYY-MM-01", value: amount
    onSuccess: () => void;
}

const CHANNELS = [
    { code: 'WEB', label: 'WEB販売' },
    { code: 'WHOLESALE', label: '卸・OEM' },
    { code: 'STORE', label: '会津ブランド館' },
    { code: 'SHOKU', label: '道の駅（食）' },
];

export default function KpiTargetModal({ isOpen, onClose, fiscalYear, initialData, onSuccess }: KpiTargetModalProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<{ [key: string]: string }>({});

    // Generate months for the FY (Aug - Jul)
    const months: string[] = [];
    const start = new Date(fiscalYear - 1, 7, 1);
    for (let i = 0; i < 12; i++) {
        const d = new Date(start);
        d.setMonth(start.getMonth() + i);
        months.push(format(d, 'yyyy-MM-01'));
    }

    useEffect(() => {
        if (isOpen) {
            // Initialize form data from initialData
            const newForm: any = {};
            // Channel Sales
            CHANNELS.forEach(c => {
                months.forEach(m => {
                    const key = `${c.code}_${m}`;
                    newForm[key] = initialData[key] ? initialData[key].toString() : '';
                });
            });
            // Acquisition & Manufacturing
            months.forEach(m => {
                const acqTargetKey = `acquisition_target_${m}`;
                const acqActualKey = `acquisition_actual_${m}`;
                newForm[acqTargetKey] = initialData[acqTargetKey] ? initialData[acqTargetKey].toString() : '';
                newForm[acqActualKey] = initialData[acqActualKey] ? initialData[acqActualKey].toString() : '';

                const manTargetKey = `manufacturing_target_${m}`;
                const manActualKey = `manufacturing_actual_${m}`;
                newForm[manTargetKey] = initialData[manTargetKey] ? initialData[manTargetKey].toString() : '';
                newForm[manActualKey] = initialData[manActualKey] ? initialData[manActualKey].toString() : '';
            });

            setFormData(newForm);
        }
    }, [isOpen, fiscalYear, initialData]);

    const handleChange = (key: string, value: string) => {
        // Allow only numbers
        if (value && !/^\d*$/.test(value)) return;
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const promises = [];
            for (const [key, value] of Object.entries(formData)) {
                // key: channel_month OR metric_type_month

                let metric = 'target';
                let channel = '';
                let month = '';
                let amount = value ? parseInt(value) : 0;

                if (key.startsWith('acquisition')) {
                    if (key.startsWith('acquisition_target_')) {
                        metric = 'acquisition_target';
                        month = key.replace('acquisition_target_', '');
                        channel = 'SALES_TEAM';
                    } else if (key.startsWith('acquisition_actual_')) {
                        metric = 'acquisition_actual';
                        month = key.replace('acquisition_actual_', '');
                        channel = 'SALES_TEAM';
                    }
                } else if (key.startsWith('manufacturing')) {
                    if (key.startsWith('manufacturing_target_')) {
                        metric = 'manufacturing_target';
                        month = key.replace('manufacturing_target_', '');
                        channel = 'FACTORY';
                    } else if (key.startsWith('manufacturing_actual_')) {
                        metric = 'manufacturing_actual';
                        month = key.replace('manufacturing_actual_', '');
                        channel = 'FACTORY';
                    }
                } else {
                    // standard channel sales
                    const [c, m] = key.split('_');
                    channel = c;
                    month = m;
                }

                if (value !== '') {
                    promises.push(saveKpiTarget({ metric, channel, month, amount }));
                }
            }

            await Promise.all(promises);
            onSuccess();
            onClose();
        } catch (error) {
            console.error(error);
            alert('保存中にエラーが発生しました');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>目標値入力 (FY{fiscalYear})</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-auto py-4">
                    <div className="space-y-4">
                        {/* 1. Sales Targets */}
                        <div className="rounded-md border">
                            <table className="w-full border-collapse">
                                <thead className="sticky top-0 bg-white z-10 shadow-sm">
                                    <tr>
                                        <th className="p-2 border text-left bg-gray-50 font-medium text-sm min-w-[150px]">月（売上目標）</th>
                                        {CHANNELS.map(c => (
                                            <th key={c.code} className="p-2 border text-left bg-gray-50 font-medium text-sm min-w-[120px]">
                                                {c.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {months.map(month => {
                                        const dateLabel = format(new Date(month), 'yyyy年M月');
                                        return (
                                            <tr key={month}>
                                                <td className="p-2 border bg-gray-50 text-sm font-medium">{dateLabel}</td>
                                                {CHANNELS.map(c => (
                                                    <td key={`${c.code}_${month}`} className="p-2 border">
                                                        <Input
                                                            className="h-8 text-right"
                                                            value={formData[`${c.code}_${month}`] || ''}
                                                            onChange={(e) => handleChange(`${c.code}_${month}`, e.target.value)}
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* 2. Sales Activities (Acquisition) */}
                        <div className="rounded-md border mt-8">
                            <div className="p-2 bg-gray-100 font-bold text-sm">営業活動（新規・OEM獲得数）</div>
                            {/* ... existing table code ... */}
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr>
                                        <th className="p-2 border text-left bg-gray-50 font-medium text-sm min-w-[150px]">月</th>
                                        <th className="p-2 border text-left bg-gray-50 font-medium text-sm">目標件数</th>
                                        <th className="p-2 border text-left bg-gray-50 font-medium text-sm">実績件数</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {months.map(month => {
                                        const dateLabel = format(new Date(month), 'yyyy年M月');
                                        return (
                                            <tr key={month}>
                                                <td className="p-2 border bg-gray-50 text-sm font-medium">{dateLabel}</td>
                                                <td className="p-2 border">
                                                    <Input
                                                        className="h-8 text-right"
                                                        value={formData[`acquisition_target_${month}`] || ''}
                                                        onChange={(e) => handleChange(`acquisition_target_${month}`, e.target.value)}
                                                        placeholder="0"
                                                    />
                                                </td>
                                                <td className="p-2 border">
                                                    <Input
                                                        className="h-8 text-right"
                                                        value={formData[`acquisition_actual_${month}`] || ''}
                                                        onChange={(e) => handleChange(`acquisition_actual_${month}`, e.target.value)}
                                                        placeholder="0"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* 3. Product Manufacturing */}
                        <div className="rounded-md border mt-8">
                            <div className="p-2 bg-gray-100 font-bold text-sm">商品製造数</div>
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr>
                                        <th className="p-2 border text-left bg-gray-50 font-medium text-sm min-w-[150px]">月</th>
                                        <th className="p-2 border text-left bg-gray-50 font-medium text-sm">製造目標</th>
                                        <th className="p-2 border text-left bg-gray-50 font-medium text-sm">製造実績</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {months.map(month => {
                                        const dateLabel = format(new Date(month), 'yyyy年M月');
                                        return (
                                            <tr key={month}>
                                                <td className="p-2 border bg-gray-50 text-sm font-medium">{dateLabel}</td>
                                                <td className="p-2 border">
                                                    <Input
                                                        className="h-8 text-right"
                                                        value={formData[`manufacturing_target_${month}`] || ''}
                                                        onChange={(e) => handleChange(`manufacturing_target_${month}`, e.target.value)}
                                                        placeholder="0"
                                                    />
                                                </td>
                                                <td className="p-2 border">
                                                    <Input
                                                        className="h-8 text-right"
                                                        value={formData[`manufacturing_actual_${month}`] || ''}
                                                        onChange={(e) => handleChange(`manufacturing_actual_${month}`, e.target.value)}
                                                        placeholder="0"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={loading}>キャンセル</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        保存
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog >
    );
}

