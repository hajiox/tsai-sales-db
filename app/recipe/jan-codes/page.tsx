"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, Save, Copy, Package, Box, Tag, Key } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import BarcodeImage from "@/components/barcode-image";

interface JanCode {
    id: string;
    jan_code: string;
    company_prefix: string;
    item_code: string;
    check_digit: string;
    product_name: string;
    category: string;
    price_excl_tax: number | null;
    ingredients: string | null;
    memo: string | null;
    created_at: string;
}

export default function JanCodesPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const fromRecipeId = searchParams.get('from_recipe');
    const prefilledName = searchParams.get('product_name');
    const [janCodes, setJanCodes] = useState<JanCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    
    // New JAN form state
    const [isGenerating, setIsGenerating] = useState(false);
    const [newProductName, setNewProductName] = useState(prefilledName || "");
    const [newCategory, setNewCategory] = useState("食品");


    // Edit state
    const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchJanCodes();
    }, []);

    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingCell]);

    const fetchJanCodes = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("jan_codes")
            .select("*")
            .order("jan_code", { ascending: false });

        if (error) {
            toast.error("取得失敗: " + error.message);
        } else if (data) {
            setJanCodes(data);
        }
        setLoading(false);
    };

    const handleGenerate = async () => {
        if (!newProductName.trim()) {
            toast.error("商品名を入力してください");
            return;
        }

        const confirmMsg = fromRecipeId
            ? `「${newProductName}」の新しいJANコードを発行し、レシピに自動挿入します。\nよろしいですか？`
            : `新しいJANコードを発行しますか？`;
        if (!confirm(confirmMsg)) return;

        setIsGenerating(true);
        try {
            const res = await fetch("/api/recipe/jan-codes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    product_name: newProductName,
                    category: newCategory,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "発行失敗");
            }

            const result = await res.json();
            const newJanCode = result.data?.jan_code;

            // レシピからの遷移の場合、JANコードを持ってレシピページに戻る
            if (fromRecipeId && newJanCode) {
                toast.success(`JANコード ${newJanCode} を発行しました。レシピに戻ります...`);
                router.push(`/recipe/${fromRecipeId}?jan_code=${newJanCode}`);
                return;
            }

            toast.success(`新しいJANコード ${newJanCode || ''} を発行しました`);
            
            // Reset form
            setNewProductName("");
            
            // Refetch
            fetchJanCodes();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCellChange = async (id: string, field: string, value: string) => {
        const item = janCodes.find((j) => j.id === id);
        if (!item) return;
        
        // Convert number strings if needed
        let parsedValue: any = value;
        if (field === "price_excl_tax") {
            const num = parseFloat(value);
            parsedValue = isNaN(num) ? null : num;
        }

        if ((item as any)[field] === parsedValue) return; // No change

        // Optimistic update
        setJanCodes(prev => prev.map(j => j.id === id ? { ...j, [field]: parsedValue } : j));

        try {
            const { error } = await supabase
                .from("jan_codes")
                .update({ [field]: parsedValue })
                .eq("id", id);
                
            if (error) throw error;
        } catch (e: any) {
            toast.error('保存失敗:');
            fetchJanCodes(); // revert
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("クリップボードにコピーしました");
    };

    const filtered = janCodes.filter(j => {
        if (categoryFilter !== "all" && j.category !== categoryFilter) return false;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (j.product_name || "").toLowerCase().includes(term) || (j.jan_code || "").includes(term) || (j.memo || "").toLowerCase().includes(term);
        }
        return true;
    });

    const renderEditableCell = (item: JanCode, field: string, displayValue: string, width: string = "w-full") => {
        const isEditing = editingCell?.id === item.id && editingCell?.field === field;
        if (isEditing) {
            return (
                <input
                    ref={inputRef}
                    type="text"
                    defaultValue={displayValue || ""}
                    onBlur={(e) => {
                        handleCellChange(item.id, field, e.target.value);
                        setEditingCell(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCellChange(item.id, field, e.currentTarget.value);
                            setEditingCell(null);
                        }
                        if (e.key === 'Escape') setEditingCell(null);
                    }}
                    className="h-full px-2 py-1 border border-blue-500 rounded text-sm focus:outline-none bg-white"
                />
            );
        }
        return (
            <div
                className="px-2 py-1 cursor-pointer hover:bg-blue-50 rounded min-h-[1.5rem] break-all"
                onClick={() => setEditingCell({ id: item.id, field })}
                title="ダブルクリックまたはタップで編集"
            >
                {displayValue || <span className="text-gray-300">-</span>}
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col pt-4">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.push("/recipe")}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        戻る
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Key className="w-6 h-6" />
                            JANコード管理
                        </h1>
                        <p className="text-gray-600 text-sm">GS1事業者コードに基づくバーコード一元管理（※セルクリックで編集可能）</p>
                    </div>
                </div>
            </div>

            {/* GS1 New JAN Generator */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4 border-b pb-2">
                    <Tag className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-bold text-gray-800">新規JANコード発番</h2>
                    {fromRecipeId && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            レシピからの発行 → 発行後自動挿入
                        </span>
                    )}
                </div>
                
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full space-y-2">
                        <label className="text-xs font-bold text-gray-600">区分（品目）</label>
                        <Select value={newCategory} onValueChange={setNewCategory}>
                            <SelectTrigger className="w-[120px] bg-white">
                                <SelectValue placeholder="区分" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="食品">食品 (...863)</SelectItem>
                                <SelectItem value="物品">物品 (...862)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex-[3] w-full space-y-2">
                        <label className="text-xs font-bold text-gray-600">商品詳細（品名表示名）</label>
                        <Input
                            placeholder="例: 会津ソースカツ丼のソース"
                            value={newProductName}
                            onChange={(e) => setNewProductName(e.target.value)}
                            className="w-full bg-white"
                        />
                    </div>

                    <div className="w-full md:w-auto">
                        <Button 
                            onClick={handleGenerate} 
                            disabled={isGenerating || !newProductName.trim()}
                            className="w-full"
                        >
                            {isGenerating ? "発番中..." : "連番で新規発行する"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-4">
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                        placeholder="商品名、JAN、備考で検索..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[150px] bg-white">
                        <SelectValue placeholder="すべて" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全区分</SelectItem>
                        <SelectItem value="食品">食品 (...863)</SelectItem>
                        <SelectItem value="物品">物品 (...862)</SelectItem>
                    </SelectContent>
                </Select>
                <div className="text-sm text-gray-500 ml-auto flex items-end mb-2">
                    {filtered.length} 件表示中
                </div>
            </div>

            {/* Data Table */}
            <div className="flex-1 overflow-auto bg-white border border-gray-300 rounded-lg">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-100 z-10">
                        <tr className="border-b">
                            <th className="px-2 py-2 text-center w-24">取得日</th>
                            <th className="px-3 py-2 text-left w-20">区分</th>
                            <th className="px-3 py-2 text-left w-36">JANコード</th>
                            <th className="px-3 py-2 text-center w-10">CD</th>
                            <th className="px-2 py-2 text-left min-w-[250px]">商品名</th>
                            <th className="px-2 py-2 text-center w-36">バーコード</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="text-center py-8 text-gray-500">読み込み中...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-8 text-gray-500">データがありません</td></tr>
                        ) : (
                            filtered.map((item) => (
                                <tr key={item.id} className="border-b hover:bg-gray-50">
                                    <td className="px-2 py-1 flex items-center justify-center">
                                       <span className="text-xs text-gray-500">
                                            {item.created_at ? new Date(item.created_at).toLocaleDateString("ja-JP") : "-"}
                                       </span>
                                    </td>
                                    <td className="px-3 py-1">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.category === '食品' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                            {item.category}
                                        </span>
                                    </td>
                                    <td className="px-3 py-1">
                                        <div className="flex items-center gap-1 font-mono">
                                            <span>{item.jan_code}</span>
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyToClipboard(item.jan_code)}>
                                                <Copy className="w-3 h-3 text-gray-400 hover:text-blue-500" />
                                            </Button>
                                        </div>
                                    </td>
                                    <td className="px-3 py-1 text-center font-mono text-gray-400">
                                        {item.check_digit}
                                    </td>
                                    <td className="px-2 py-1 font-medium">
                                        {renderEditableCell(item, 'product_name', item.product_name, 'min-w-[200px]')}
                                    </td>
                                    <td className="px-2 py-2 text-center">
                                        <BarcodeImage code={item.jan_code} scale={4} />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
