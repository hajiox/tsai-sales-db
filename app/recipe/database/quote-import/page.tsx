"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Upload, FileText, CheckCircle2, AlertCircle, Loader2, Save, Trash2, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

interface Suggestion {
    original_name: string;
    extracted_price: number;
    matched_id: string | null;
    matched_name: string | null;
    current_price: number | null;
    suggestion_type: "update" | "create" | "ignore";
    category: "ingredient" | "material";
    confidence: number;
    reason: string;
    selected?: boolean;
}

export default function QuoteImportPage() {
    const router = useRouter();
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [isUpdating, setIsUpdating] = useState(false);
    const [ingredients, setIngredients] = useState<any[]>([]);
    const [materials, setMaterials] = useState<any[]>([]);

    useEffect(() => {
        fetchBaseData();
    }, []);

    const fetchBaseData = async () => {
        const { data: ing } = await supabase.from("ingredients").select("id, name, price");
        const { data: mat } = await supabase.from("materials").select("id, name, price");
        setIngredients(ing || []);
        setMaterials(mat || []);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true);
        setSuggestions([]);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/quote/analyze", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) throw new Error("解析に失敗しました");

            const data = await res.json();
            setSuggestions(data.suggestions.map((s: any) => ({ ...s, selected: s.suggestion_type !== "ignore" })));
            toast.success("解析が完了しました");
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleSelection = (index: number) => {
        setSuggestions(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s));
    };

    const handleExecuteUpdates = async () => {
        const selectedUpdates = suggestions.filter(s => s.selected);
        if (selectedUpdates.length === 0) {
            toast.error("更新対象が選択されていません");
            return;
        }

        setIsUpdating(true);
        try {
            const res = await fetch("/api/quote/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ updates: selectedUpdates }),
            });

            if (!res.ok) throw new Error("更新に失敗しました");

            toast.success(`${selectedUpdates.length}件のデータを更新・作成しました`);
            router.push("/recipe/database");
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.push("/recipe/database")}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        戻る
                    </Button>
                    <h1 className="text-3xl font-bold text-gray-900">見積書AI解析・価格更新</h1>
                </div>
            </div>

            <Card className="border-dashed border-2 bg-gray-50/50">
                <CardContent className="pt-6">
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="p-4 bg-blue-100 rounded-full text-blue-600">
                            <Upload className="w-8 h-8" />
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-medium text-gray-700">見積書のPDFまたは画像をアップロード</p>
                            <p className="text-sm text-gray-500">FAXのスキャンデータや写真も解析可能です</p>
                        </div>
                        <div className="flex gap-4">
                            <input
                                type="file"
                                id="quote-upload"
                                className="hidden"
                                accept="image/*,application/pdf"
                                onChange={handleFileChange}
                            />
                            <Button asChild variant="outline">
                                <label htmlFor="quote-upload" className="cursor-pointer">
                                    ファイルを選択
                                </label>
                            </Button>
                            <Button onClick={handleUpload} disabled={!file || loading}>
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 解析中...</>
                                ) : (
                                    "AIで解析開始"
                                )}
                            </Button>
                        </div>
                        {file && (
                            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded">
                                <FileText className="w-4 h-4" />
                                {file.name}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {suggestions.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            解析結果と更新案
                        </h2>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setSuggestions([])} disabled={isUpdating}>
                                クリア
                            </Button>
                            <Button onClick={handleExecuteUpdates} disabled={isUpdating} className="bg-green-600 hover:bg-green-700">
                                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                選択した更新を実行
                            </Button>
                        </div>
                    </div>

                    <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="p-3 text-left w-12">選</th>
                                    <th className="p-3 text-left">見積書項目名</th>
                                    <th className="p-3 text-left">DB照合先項目</th>
                                    <th className="p-3 text-left">区分</th>
                                    <th className="p-3 text-right">旧価格</th>
                                    <th className="p-3 text-left w-12 text-center"></th>
                                    <th className="p-3 text-right">新価格 (見積)</th>
                                    <th className="p-3 text-left">AI提案</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {suggestions.map((s, idx) => (
                                    <tr key={idx} className={`hover:bg-gray-50 transition ${s.selected ? 'bg-blue-50/30' : 'opacity-60'}`}>
                                        <td className="p-3">
                                            <input
                                                type="checkbox"
                                                checked={s.selected}
                                                onChange={() => toggleSelection(idx)}
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </td>
                                        <td className="p-3">
                                            <div className="font-medium text-gray-900">{s.original_name}</div>
                                            <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                                                <Badge variant="outline" className="px-1 py-0 text-[9px] font-normal">確信度 {Math.round(s.confidence * 100)}%</Badge>
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            {s.matched_id ? (
                                                <div className="flex flex-col">
                                                    <span className="text-gray-900">{s.matched_name}</span>
                                                    <span className="text-[10px] text-gray-400">ID: {s.matched_id.slice(-8)}</span>
                                                </div>
                                            ) : (
                                                <span className="text-orange-600 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" />
                                                    一致なし
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            <Badge className={s.category === 'ingredient' ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-orange-100 text-orange-700 hover:bg-orange-100'}>
                                                {s.category === 'ingredient' ? '食材' : '資材'}
                                            </Badge>
                                        </td>
                                        <td className="p-3 text-right text-gray-500">
                                            {s.current_price ? `¥${s.current_price.toLocaleString()}` : '-'}
                                        </td>
                                        <td className="p-3 text-center">
                                            <ArrowRight className="w-3 h-3 text-gray-300 inline" />
                                        </td>
                                        <td className="p-3 text-right font-bold text-blue-700">
                                            ¥{s.extracted_price?.toLocaleString()}
                                        </td>
                                        <td className="p-3">
                                            {s.suggestion_type === 'update' && (
                                                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">価格更新</Badge>
                                            )}
                                            {s.suggestion_type === 'create' && (
                                                <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">新規登録</Badge>
                                            )}
                                            <p className="text-[10px] text-gray-500 mt-1 max-w-[200px] leading-tight">
                                                {s.reason}
                                            </p>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
