// app/recipe/database/page.tsx
// 材料データベースページ（食材/資材/中間部品） - Updated at 2026-02-12 15:28

"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Save, Search, Package, Trash2, Apple, Box, Layers } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Ingredient {
    id: string;
    name: string;
    unit_quantity: number | null;
    price: number | null;
    calories: number | null;
    protein: number | null;
    fat: number | null;
    carbohydrate: number | null;
    sodium: number | null;
    isNew?: boolean;
    isModified?: boolean;
}

interface Material {
    id: string;
    name: string;
    unit_quantity: string | null;
    price: number | null;
    supplier: string | null;
    notes: string | null;
    isNew?: boolean;
    isModified?: boolean;
}

interface IntermediateProduct {
    id: string;
    name: string;
    category: string;
    selling_price: number | null;
    source_file: string | null;
}

type TabType = "ingredients" | "materials" | "intermediate";

export default function DatabasePage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabType>("ingredients");
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [intermediates, setIntermediates] = useState<IntermediateProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [hasChanges, setHasChanges] = useState(false);
    const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingCell]);

    const fetchData = async () => {
        setLoading(true);

        // 食材
        const { data: ingData } = await supabase
            .from("ingredients")
            .select("*")
            .order("name");
        if (ingData) setIngredients(ingData);

        // 資材
        const { data: matData } = await supabase
            .from("materials")
            .select("*")
            .order("name");
        if (matData) setMaterials(matData);

        // 中間部品
        const { data: intData } = await supabase
            .from("recipes")
            .select("id, name, category, selling_price, source_file")
            .eq("is_intermediate", true)
            .order("name");
        if (intData) setIntermediates(intData);

        setLoading(false);
    };

    const handleCellDoubleClick = (id: string, field: string) => {
        if (activeTab === "intermediate") return; // 中間部品は読み取り専用
        setEditingCell({ id, field });
    };

    const handleCellChange = async (id: string, field: string, value: string, type: "ingredient" | "material") => {
        const numericFields = ['unit_quantity', 'price', 'calories', 'protein', 'fat', 'carbohydrate', 'sodium'];
        const parsedValue = numericFields.includes(field)
            ? (value === '' ? null : parseFloat(value))
            : value;

        // 1. UI更新 (Optimistic)
        if (type === "ingredient") {
            setIngredients(prev => prev.map(item =>
                item.id === id ? { ...item, [field]: parsedValue } : item
            ));
        } else {
            setMaterials(prev => prev.map(item =>
                item.id === id ? { ...item, [field]: parsedValue } : item
            ));
        }

        // 2. DB更新
        const table = type === "ingredient" ? "ingredients" : "materials";
        const { error } = await supabase
            .from(table)
            .update({ [field]: parsedValue })
            .eq('id', id);

        if (error) {
            console.error(`Update failed for ${table}:`, error);
            toast.error(`保存失敗: ${error.message}`);
        }
    };

    const handleCellBlur = () => {
        setEditingCell(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent, id: string, field: string, type: "ingredient" | "material") => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            setEditingCell(null);
        }
        if (e.key === 'Escape') {
            setEditingCell(null);
        }
    };

    const addNewIngredient = async () => {
        const newData = {
            name: "新規項目",
            unit_quantity: 1000,
            price: 0,
        };

        const { data, error } = await supabase
            .from('ingredients')
            .insert(newData)
            .select()
            .single();

        if (error || !data) {
            console.error("Add ingredient failed:", error);
            toast.error(`追加失敗: ${error?.message || 'Unknown'}`);
            return;
        }

        setIngredients(prev => [{ ...data, isNew: true }, ...prev]);
        setEditingCell({ id: data.id, field: 'name' });
    };

    const addNewMaterial = async () => {
        const newData = {
            name: "新規資材",
            price: 0,
        };

        const { data, error } = await supabase
            .from('materials')
            .insert(newData)
            .select()
            .single();

        if (error || !data) {
            console.error("Add material failed:", error);
            toast.error(`追加失敗: ${error?.message || 'Unknown'}`);
            return;
        }

        setMaterials(prev => [{ ...data, isNew: true }, ...prev]);
        setEditingCell({ id: data.id, field: 'name' });
    };

    const deleteIngredient = async (id: string) => {
        if (id.startsWith('new-')) {
            setIngredients(prev => prev.filter(i => i.id !== id));
        } else {
            if (confirm('この食材を削除しますか？')) {
                await supabase.from('ingredients').delete().eq('id', id);
                setIngredients(prev => prev.filter(i => i.id !== id));
                toast.success('削除しました');
            }
        }
    };

    const deleteMaterial = async (id: string) => {
        if (id.startsWith('new-')) {
            setMaterials(prev => prev.filter(m => m.id !== id));
        } else {
            if (confirm('この資材を削除しますか？')) {
                await supabase.from('materials').delete().eq('id', id);
                setMaterials(prev => prev.filter(m => m.id !== id));
                toast.success('削除しました');
            }
        }
    };

    // saveChanges logic is removed in favor of auto-save
    const saveChanges = async () => { };

    // フィルタリング
    const filteredIngredients = ingredients.filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const filteredMaterials = materials.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const filteredIntermediates = intermediates.filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatNumber = (value: number | null, decimals = 2) => {
        if (value === null || value === undefined) return '';
        return value.toFixed(decimals);
    };

    const renderEditableCell = (
        item: Ingredient | Material,
        field: string,
        displayValue: string,
        type: "ingredient" | "material",
        width: string = 'w-24'
    ) => {
        const isEditing = editingCell?.id === item.id && editingCell?.field === field;

        if (isEditing) {
            return (
                <input
                    ref={inputRef}
                    type="text"
                    defaultValue={displayValue}
                    onBlur={(e) => {
                        handleCellChange(item.id, field, e.target.value, type);
                        handleCellBlur();
                    }}
                    onKeyDown={(e) => handleKeyDown(e, item.id, field, type)}
                    className={`${width} px-2 py-1 border border-blue-500 rounded text-sm focus:outline-none`}
                />
            );
        }

        const isModified = 'isModified' in item && item.isModified;
        return (
            <div
                className={`${width} px-2 py-1 cursor-pointer hover:bg-blue-50 rounded ${isModified ? 'bg-yellow-50' : ''}`}
                onClick={() => handleCellDoubleClick(item.id, field)}
            >
                {displayValue || <span className="text-gray-300">-</span>}
            </div>
        );
    };

    const tabs = [
        { key: "ingredients" as TabType, label: "食材", icon: Apple, count: ingredients.length },
        { key: "materials" as TabType, label: "資材", icon: Box, count: materials.length },
        { key: "intermediate" as TabType, label: "中間部品【P】", icon: Layers, count: intermediates.length },
    ];

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.push("/recipe")}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        戻る
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Package className="w-6 h-6" />
                            材料データベース
                        </h1>
                        <p className="text-gray-600 text-sm">ダブルクリックで編集</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {activeTab !== "intermediate" && (
                        <Button onClick={activeTab === "ingredients" ? addNewIngredient : addNewMaterial} variant="outline">
                            <Plus className="w-4 h-4 mr-2" />
                            新規追加
                        </Button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-300 mb-4">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => {
                                setActiveTab(tab.key);
                                setSearchTerm("");
                            }}
                            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-t border-l border-r rounded-t-lg -mb-px transition ${activeTab === tab.key
                                ? "bg-white border-gray-300 text-gray-900"
                                : "bg-gray-100 border-transparent text-gray-500 hover:text-gray-700"
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === tab.key ? "bg-blue-100 text-blue-800" : "bg-gray-200 text-gray-600"
                                }`}>
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Search */}
            <div className="mb-4">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                        placeholder="検索..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto bg-white border border-gray-300 border-t-0 rounded-b-lg">
                {loading ? (
                    <div className="text-center py-8 text-gray-500">読み込み中...</div>
                ) : activeTab === "ingredients" ? (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-100 z-10">
                            <tr className="border-b">
                                <th className="px-2 py-2 text-left w-10">NO</th>
                                <th className="px-2 py-2 text-left min-w-[200px]">食材名</th>
                                <th className="px-2 py-2 text-right w-24">入数(g)</th>
                                <th className="px-2 py-2 text-right w-24">価格</th>
                                <th className="px-2 py-2 text-right w-20">熱量</th>
                                <th className="px-2 py-2 text-right w-20">タンパク</th>
                                <th className="px-2 py-2 text-right w-20">脂質</th>
                                <th className="px-2 py-2 text-right w-20">炭水化物</th>
                                <th className="px-2 py-2 text-right w-20">食塩</th>
                                <th className="px-2 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredIngredients.length === 0 ? (
                                <tr><td colSpan={10} className="text-center py-8 text-gray-500">データがありません</td></tr>
                            ) : (
                                filteredIngredients.map((ing, index) => (
                                    <tr key={ing.id} className={`border-b hover:bg-gray-50 ${ing.isNew ? 'bg-green-50' : ''} ${ing.isModified && !ing.isNew ? 'bg-yellow-50' : ''}`}>
                                        <td className="px-2 py-1 text-gray-500">{index + 1}</td>
                                        <td className="px-0 py-1">{renderEditableCell(ing, 'name', ing.name, 'ingredient', 'min-w-[180px]')}</td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'unit_quantity', formatNumber(ing.unit_quantity, 0), 'ingredient')}</td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'price', formatNumber(ing.price, 0), 'ingredient')}</td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'calories', formatNumber(ing.calories, 1), 'ingredient')}</td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'protein', formatNumber(ing.protein, 1), 'ingredient')}</td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'fat', formatNumber(ing.fat, 1), 'ingredient')}</td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'carbohydrate', formatNumber(ing.carbohydrate, 1), 'ingredient')}</td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'sodium', formatNumber(ing.sodium, 2), 'ingredient')}</td>
                                        <td className="px-2 py-1">
                                            <Button variant="ghost" size="sm" onClick={() => deleteIngredient(ing.id)} className="h-6 w-6 p-0 text-gray-400 hover:text-red-500">
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                ) : activeTab === "materials" ? (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-100 z-10">
                            <tr className="border-b">
                                <th className="px-2 py-2 text-left w-10">NO</th>
                                <th className="px-2 py-2 text-left min-w-[250px]">資材名</th>
                                <th className="px-2 py-2 text-left w-40">入数</th>
                                <th className="px-2 py-2 text-right w-24">価格</th>
                                <th className="px-2 py-2 text-left w-28">仕入先</th>
                                <th className="px-2 py-2 text-left w-40">備考</th>
                                <th className="px-2 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMaterials.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-8 text-gray-500">データがありません</td></tr>
                            ) : (
                                filteredMaterials.map((mat, index) => (
                                    <tr key={mat.id} className={`border-b hover:bg-gray-50 ${mat.isNew ? 'bg-green-50' : ''} ${mat.isModified && !mat.isNew ? 'bg-yellow-50' : ''}`}>
                                        <td className="px-2 py-1 text-gray-500">{index + 1}</td>
                                        <td className="px-0 py-1">{renderEditableCell(mat, 'name', mat.name, 'material', 'min-w-[230px]')}</td>
                                        <td className="px-0 py-1">{renderEditableCell(mat, 'unit_quantity', mat.unit_quantity || '', 'material', 'w-36')}</td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(mat, 'price', formatNumber(mat.price, 0), 'material')}</td>
                                        <td className="px-0 py-1">{renderEditableCell(mat, 'supplier', mat.supplier || '', 'material', 'w-24')}</td>
                                        <td className="px-0 py-1">{renderEditableCell(mat, 'notes', mat.notes || '', 'material', 'w-36')}</td>
                                        <td className="px-2 py-1">
                                            <Button variant="ghost" size="sm" onClick={() => deleteMaterial(mat.id)} className="h-6 w-6 p-0 text-gray-400 hover:text-red-500">
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-100 z-10">
                            <tr className="border-b">
                                <th className="px-2 py-2 text-left w-10">NO</th>
                                <th className="px-2 py-2 text-left min-w-[300px]">中間部品名</th>
                                <th className="px-2 py-2 text-left w-28">カテゴリ</th>
                                <th className="px-2 py-2 text-right w-24">価格</th>
                                <th className="px-2 py-2 text-left w-40">ソースファイル</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredIntermediates.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-8 text-gray-500">データがありません</td></tr>
                            ) : (
                                filteredIntermediates.map((item, index) => (
                                    <tr
                                        key={item.id}
                                        className="border-b hover:bg-gray-50 cursor-pointer"
                                        onClick={() => router.push(`/recipe/${item.id}`)}
                                    >
                                        <td className="px-2 py-1 text-gray-500">{index + 1}</td>
                                        <td className="px-2 py-1 font-medium">{item.name}</td>
                                        <td className="px-2 py-1">
                                            <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                                                {item.category}
                                            </span>
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            {item.selling_price ? `¥${item.selling_price.toLocaleString()}` : '-'}
                                        </td>
                                        <td className="px-2 py-1 text-xs text-gray-500 truncate max-w-[200px]">
                                            {item.source_file?.replace("【重要】【製造】総合管理（新型）", "").replace(".xlsx", "") || "-"}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
