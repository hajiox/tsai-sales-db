
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
    { code: 'STORE', label: '店舗（会津）' },
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
            CHANNELS.forEach(c => {
                months.forEach(m => {
                    const key = `${c.code}_${m}`;
                    newForm[key] = initialData[key] ? initialData[key].toString() : '';
                });
            });
            setFormData(newForm);
        }
    }, [isOpen, fiscalYear, initialData]);

    const handleChange = (channel: string, month: string, value: string) => {
        // Allow only numbers
        if (value && !/^\d*$/.test(value)) return;
        setFormData(prev => ({ ...prev, [`${channel}_${month}`]: value }));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const promises = [];
            for (const [key, value] of Object.entries(formData)) {
                const [channel, month] = key.split('_');
                const amount = value ? parseInt(value) : 0;

                // Only save if different from initial or valid amount
                // But for simplicity, we save all non-empty or if it overwrites validation
                // Actually, we should just save everything that looks like a number

                // Optimize: Check if changed? 
                // For now, let's just save all non-empty entries to ensure consistency
                if (value !== '') {
                    promises.push(saveKpiTarget({ channel, month, amount }));
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
                    <table className="w-full border-collapse">
                        <thead className="sticky top-0 bg-white z-10 shadow-sm">
                            <tr>
                                <th className="p-2 border text-left bg-gray-50 font-medium text-sm min-w-[150px]">月</th>
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
                                                    onChange={(e) => handleChange(c.code, month, e.target.value)}
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

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={loading}>キャンセル</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        保存
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
