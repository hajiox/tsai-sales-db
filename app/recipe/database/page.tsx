// app/recipe/database/page.tsx
// 材料データベースページ（食材/資材/中間部品） - Updated at 2026-02-12 15:28

"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Save, Search, Package, Trash2, Apple, Box, Layers, FileText } from "lucide-react";
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
    tax_included?: boolean;
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
    tax_included?: boolean;
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

interface Expense {
    id: string;
    name: string;
    unit_price: number | null;
    unit_quantity: number | null;
    notes: string | null;
    tax_included?: boolean;
    isNew?: boolean;
}

type TabType = "ingredients" | "materials" | "intermediate" | "expense";

export default function DatabasePage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabType>("ingredients");
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [intermediates, setIntermediates] = useState<IntermediateProduct[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [hasChanges, setHasChanges] = useState(false);
    const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);

    const [taxRates, setTaxRates] = useState({
        ingredient: 8,
        material: 10,
        amazon_fee: 10
    });

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem('global_tax_settings');
        if (saved) {
            try {
                setTaxRates(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to load tax settings", e);
            }
        }
    }, []);

    const saveTaxRates = (newRates: typeof taxRates) => {
        setTaxRates(newRates);
        localStorage.setItem('global_tax_settings', JSON.stringify(newRates));
        toast.success("税率設定を保存しました（ブラウザ保存）");
    };

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
        if (ingData) {
            setIngredients(ingData.map(i => ({ ...i, tax_included: i.tax_included ?? true })));
        }

        // 資材
        const { data: matData } = await supabase
            .from("materials")
            .select("*")
            .order("name");
        if (matData) {
            setMaterials(matData.map(m => ({ ...m, tax_included: m.tax_included ?? true })));
        }

        // 中間部品
        const { data: intData } = await supabase
            .from("recipes")
            .select("id, name, category, selling_price, source_file")
            .eq("is_intermediate", true)
            .order("name");
        if (intData) setIntermediates(intData);

        // 諸経費
        const { data: expData } = await supabase
            .from("expenses")
            .select("*")
            .order("name");
        if (expData) {
            setExpenses(expData.map(e => ({ ...e, tax_included: e.tax_included ?? false })));
        }

        setLoading(false);
    };

    const handleTaxToggle = async (id: string, current: boolean, type: "ingredient" | "material" | "expense") => {
        const next = !current;
        let table = "";
        if (type === "ingredient") table = "ingredients";
        else if (type === "material") table = "materials";
        else table = "expenses";

        // Optimistic UI update
        if (type === "ingredient") {
            setIngredients(prev => prev.map(i => i.id === id ? { ...i, tax_included: next } : i));
        } else if (type === "material") {
            setMaterials(prev => prev.map(m => m.id === id ? { ...m, tax_included: next } : m));
        } else {
            setExpenses(prev => prev.map(e => e.id === id ? { ...e, tax_included: next } : e));
        }

        const { error } = await supabase
            .from(table)
            .update({ tax_included: next })
            .eq('id', id);

        if (error) {
            console.error(error);
            if (error.code === '42703') {
                toast.error("DBに 'tax_included' カラムがありません。SQLを実行してください。");
            } else {
                toast.error(`保存失敗: ${error.message}`);
            }
        }
    };

    const handleCellDoubleClick = (id: string, field: string) => {
        if (activeTab === "intermediate") return; // 中間部品は読み取り専用
        setEditingCell({ id, field });
    };

    const handleCellChange = async (id: string, field: string, value: string, type: "ingredient" | "material" | "expense") => {
        const numericFields = ['unit_quantity', 'price', 'calories', 'protein', 'fat', 'carbohydrate', 'sodium'];
        let parsedValue: any = value;

        if (numericFields.includes(field)) {
            if (value === '' || value === null) {
                parsedValue = null;
            } else {
                const num = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
                parsedValue = isNaN(num) ? null : num;
            }
        }

        // 現在の値と比較して変更がなければスキップ
        const currentList = type === "ingredient" ? ingredients : type === "material" ? materials : expenses;
        const currentItem = currentList.find(i => i.id === id);
        if (currentItem && (currentItem as any)[field] === parsedValue) {
            return;
        }

        // 1. UI更新 (Optimistic)
        if (type === "ingredient") {
            setIngredients(prev => prev.map(item =>
                item.id === id ? { ...item, [field]: parsedValue } : item
            ));
        } else if (type === "material") {
            setMaterials(prev => prev.map(item =>
                item.id === id ? { ...item, [field]: parsedValue } : item
            ));
        } else {
            setExpenses(prev => prev.map(item =>
                item.id === id ? { ...item, [field]: parsedValue } : item
            ));
        }

        // 2. DB更新
        let table = "";
        if (type === "ingredient") table = "ingredients";
        else if (type === "material") table = "materials";
        else table = "expenses";
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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string, field: string, type: "ingredient" | "material" | "expense") => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = e.currentTarget.value;
            handleCellChange(id, field, value, type);
            setEditingCell(null);
        }
        if (e.key === 'Tab') {
            // Tabは自然な挙動に任せるか、あるいはBlurと同様に処理
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
    const filteredExpenses = expenses.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatNumber = (value: number | null, decimals = 2) => {
        if (value === null || value === undefined) return '';
        return value.toFixed(decimals);
    };

    const renderEditableCell = (
        item: Ingredient | Material | Expense,
        field: string,
        displayValue: string,
        type: "ingredient" | "material" | "expense",
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
                        setEditingCell(null);
                    }}
                    onKeyDown={(e) => handleKeyDown(e, item.id, field, type)}
                    className="w-full h-full px-2 py-1 border border-blue-500 rounded text-sm focus:outline-none bg-white"
                />
            );
        }

        return (
            <div
                className="w-full h-full px-2 py-1 cursor-pointer hover:bg-blue-50 rounded min-h-[1.5rem]"
                onClick={() => setEditingCell({ id: item.id, field })}
            >
                {displayValue || <span className="text-gray-300">-</span>}
            </div>
        );
    };

    const tabs = [
        { key: "ingredients" as TabType, label: "食材", icon: Apple, count: ingredients.length },
        { key: "materials" as TabType, label: "資材", icon: Box, count: materials.length },
        { key: "intermediate" as TabType, label: "中間部品【P】", icon: Layers, count: intermediates.length },
        { key: "expense" as TabType, label: "諸経費", icon: Search, count: expenses.length },
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
                    <Button onClick={() => router.push("/recipe/database/quote-import")} variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50">
                        <FileText className="w-4 h-4 mr-2" />
                        見積書AI取込
                    </Button>
                    <Button onClick={() => router.push("/recipe/database/label-import")} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
                        <FileText className="w-4 h-4 mr-2" />
                        ラベルAI取込
                    </Button>
                    {activeTab !== "intermediate" && (
                        <Button onClick={activeTab === "ingredients" ? addNewIngredient : addNewMaterial} variant="outline">
                            <Plus className="w-4 h-4 mr-2" />
                            新規追加
                        </Button>
                    )}
                </div>
            </div>

            {/* Global Tax Settings */}
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-wrap gap-8 items-center">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-800">一括税率設定:</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">食材 (軽減税率)</span>
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                value={taxRates.ingredient}
                                onChange={(e) => setTaxRates({ ...taxRates, ingredient: parseInt(e.target.value) || 0 })}
                                className="w-16 h-8 text-right bg-white"
                            />
                            <span className="text-sm text-gray-500">%</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">資材・包材</span>
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                value={taxRates.material}
                                onChange={(e) => setTaxRates({ ...taxRates, material: parseInt(e.target.value) || 0 })}
                                className="w-16 h-8 text-right bg-white"
                            />
                            <span className="text-sm text-gray-500">%</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 border-l pl-4 border-blue-200">
                        <span className="text-xs text-gray-600">Amazon手数料</span>
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                value={taxRates.amazon_fee}
                                onChange={(e) => setTaxRates({ ...taxRates, amazon_fee: parseInt(e.target.value) || 0 })}
                                className="w-16 h-8 text-right bg-white"
                            />
                            <span className="text-sm text-gray-500">%</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 border-l pl-4 border-blue-200">
                        <Button
                            size="sm"
                            variant="outline"
                            className="bg-white text-xs h-8 border-blue-300 text-blue-700 hover:bg-blue-100"
                            onClick={async () => {
                                if (!confirm(`${activeTab === 'ingredients' ? '食材' : '資材'}を全て「税込」に一括設定しますか？`)) return;
                                const table = activeTab === 'ingredients' ? 'ingredients' : 'materials';
                                const { error } = await supabase.from(table).update({ tax_included: true }).is('tax_included', null);
                                const { error: error2 } = await supabase.from(table).update({ tax_included: true }).neq('tax_included', true);
                                if (error || error2) toast.error("一括更新に失敗しました");
                                else {
                                    toast.success("全て税込に設定しました");
                                    fetchData();
                                }
                            }}
                        >
                            全て税込
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="bg-white text-xs h-8 border-blue-300 text-blue-700 hover:bg-blue-100"
                            onClick={async () => {
                                if (!confirm(`${activeTab === 'ingredients' ? '食材' : '資材'}を全て「税抜」に一括設定しますか？`)) return;
                                const table = activeTab === 'ingredients' ? 'ingredients' : 'materials';
                                const { error } = await supabase.from(table).update({ tax_included: false }).is('tax_included', null);
                                const { error: error2 } = await supabase.from(table).update({ tax_included: false }).neq('tax_included', false);
                                if (error || error2) toast.error("一括更新に失敗しました");
                                else {
                                    toast.success("全て税抜に設定しました");
                                    fetchData();
                                }
                            }}
                        >
                            全て税抜
                        </Button>
                    </div>
                    <Button size="sm" onClick={() => saveTaxRates(taxRates)} className="bg-blue-600 hover:bg-blue-700 h-8 ml-auto">
                        <Save className="w-3 h-3 mr-1" />
                        保存
                    </Button>
                </div>
                <div className="text-[10px] text-blue-500 max-w-sm">
                    ※ これらの値は全てのレシピの原価計算に使用されます。<br />
                    ※ Amazon手数料、人件費、中間部品などは自動的に対象外となります。
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
                                <th className="px-2 py-2 text-center w-20">税込設定</th>
                                <th className="px-2 py-2 text-right w-24">入数(g)</th>
                                <th className="px-2 py-2 text-right w-24">単価(税込)</th>
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
                                <tr><td colSpan={11} className="text-center py-8 text-gray-500">データがありません</td></tr>
                            ) : (
                                filteredIngredients.map((ing, index) => (
                                    <tr key={ing.id} className={`border-b hover:bg-gray-50 ${ing.isNew ? 'bg-green-50' : ''} ${ing.isModified && !ing.isNew ? 'bg-yellow-50' : ''}`}>
                                        <td className="px-2 py-1 text-gray-500">{index + 1}</td>
                                        <td className="px-0 py-1">{renderEditableCell(ing, 'name', ing.name, 'ingredient', 'min-w-[180px]')}</td>
                                        <td className="px-2 py-1 text-center">
                                            <button
                                                onClick={() => handleTaxToggle(ing.id, !!ing.tax_included, 'ingredient')}
                                                className={`text-[10px] px-2 py-0.5 rounded font-bold transition ${ing.tax_included ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}
                                            >
                                                {ing.tax_included ? '税込' : '税抜'}
                                            </button>
                                        </td>
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
                                <th className="px-2 py-2 text-center w-20">税込設定</th>
                                <th className="px-2 py-2 text-left w-40">入数</th>
                                <th className="px-2 py-2 text-right w-24">単価(税込)</th>
                                <th className="px-2 py-2 text-left w-28">仕入先</th>
                                <th className="px-2 py-2 text-left w-40">備考</th>
                                <th className="px-2 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMaterials.length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-8 text-gray-500">データがありません</td></tr>
                            ) : (
                                filteredMaterials.map((mat, index) => (
                                    <tr key={mat.id} className={`border-b hover:bg-gray-50 ${mat.isNew ? 'bg-green-50' : ''} ${mat.isModified && !mat.isNew ? 'bg-yellow-50' : ''}`}>
                                        <td className="px-2 py-1 text-gray-500">{index + 1}</td>
                                        <td className="px-0 py-1">{renderEditableCell(mat, 'name', mat.name, 'material', 'min-w-[230px]')}</td>
                                        <td className="px-2 py-1 text-center">
                                            <button
                                                onClick={() => handleTaxToggle(mat.id, !!mat.tax_included, 'material')}
                                                className={`text-[10px] px-2 py-0.5 rounded font-bold transition ${mat.tax_included ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}
                                            >
                                                {mat.tax_included ? '税込' : '税抜'}
                                            </button>
                                        </td>
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
                ) : activeTab === "expense" ? (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-100 z-10">
                            <tr className="border-b">
                                <th className="px-2 py-2 text-left w-10">NO</th>
                                <th className="px-2 py-2 text-left min-w-[250px]">経費名</th>
                                <th className="px-2 py-2 text-center w-20">税込設定</th>
                                <th className="px-2 py-2 text-right w-24">単価</th>
                                <th className="px-2 py-2 text-left w-40">備考</th>
                                <th className="px-2 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredExpenses.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-8 text-gray-500">データがありません</td></tr>
                            ) : (
                                filteredExpenses.map((exp, index) => (
                                    <tr key={exp.id} className="border-b hover:bg-gray-50">
                                        <td className="px-2 py-1 text-gray-500">{index + 1}</td>
                                        <td className="px-0 py-1">{renderEditableCell(exp, 'name', exp.name, 'expense', 'min-w-[230px]')}</td>
                                        <td className="px-2 py-1 text-center">
                                            <button
                                                onClick={() => handleTaxToggle(exp.id, !!exp.tax_included, 'expense')}
                                                className={`text-[10px] px-2 py-0.5 rounded font-bold transition ${exp.tax_included ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}
                                            >
                                                {exp.tax_included ? '税込' : '税抜'}
                                            </button>
                                        </td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(exp, 'unit_price', formatNumber(exp.unit_price, 0), 'expense')}</td>
                                        <td className="px-0 py-1">{renderEditableCell(exp, 'notes', exp.notes || '', 'expense', 'w-36')}</td>
                                        <td className="px-2 py-1">
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
