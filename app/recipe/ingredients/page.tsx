// app/recipe/ingredients/page.tsx
// 材料データベースページ - 食材・資材タブ分け

"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Save, Search, Package, Trash2, Apple, Box } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Ingredient {
    id: string;
    name: string;
    category_id: string | null;
    category_name?: string;
    unit_quantity: number;
    price_incl_tax: number | null;
    price_excl_tax: number | null;
    price_per_gram: number | null;
    calories: number | null;
    protein: number | null;
    fat: number | null;
    carbohydrate: number | null;
    sodium: number | null;
    supplier: string | null;
    item_type: "food" | "material"; // 食材 or 資材
    isNew?: boolean;
    isModified?: boolean;
}

interface Category {
    id: string;
    name: string;
}

// 食材カテゴリ
const FOOD_CATEGORIES = ["肉類", "野菜・果物", "調味料", "油脂類", "粉類", "スパイス", "その他"];
// 資材カテゴリ
const MATERIAL_CATEGORIES = ["包装資材", "発送資材", "ラベル・シール", "容器・瓶", "その他資材", "資材"];

type TabType = "food" | "material";

export default function IngredientsPage() {
    const router = useRouter();
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [activeTab, setActiveTab] = useState<TabType>("food");
    const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchCategories();
        fetchIngredients();
    }, []);

    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingCell]);

    const fetchCategories = async () => {
        const { data } = await supabase
            .from("ingredient_categories")
            .select("*")
            .order("name");
        if (data) setCategories(data);
    };

    const fetchIngredients = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("ingredients")
            .select(`
        *,
        category:ingredient_categories(name)
      `)
            .order("name");

        if (!error && data) {
            setIngredients(data.map((ing: any) => {
                const categoryName = ing.category?.name || "";
                // 資材カテゴリに属するかどうかで判定
                const isMaterial = MATERIAL_CATEGORIES.includes(categoryName) ||
                    ing.name?.includes("袋") ||
                    ing.name?.includes("容器") ||
                    ing.name?.includes("パック") ||
                    ing.name?.includes("ラベル") ||
                    ing.name?.includes("シール") ||
                    ing.name?.includes("箱") ||
                    ing.name?.includes("カップ");
                return {
                    ...ing,
                    category_name: categoryName,
                    item_type: isMaterial ? "material" : "food",
                };
            }));
        }
        setLoading(false);
    };

    const handleCellDoubleClick = (id: string, field: string) => {
        setEditingCell({ id, field });
    };

    const handleCellChange = (id: string, field: string, value: string) => {
        setIngredients(prev => prev.map(ing => {
            if (ing.id === id) {
                const numericFields = ['unit_quantity', 'price_incl_tax', 'price_excl_tax', 'price_per_gram', 'calories', 'protein', 'fat', 'carbohydrate', 'sodium'];
                const newValue = numericFields.includes(field)
                    ? (value === '' ? null : parseFloat(value))
                    : value;

                let updates: any = { [field]: newValue, isModified: true };
                if (field === 'price_incl_tax' && ing.unit_quantity) {
                    updates.price_per_gram = newValue ? (newValue as number) / ing.unit_quantity : null;
                }
                if (field === 'unit_quantity' && ing.price_incl_tax) {
                    updates.price_per_gram = newValue ? ing.price_incl_tax / (newValue as number) : null;
                }

                return { ...ing, ...updates };
            }
            return ing;
        }));
        setHasChanges(true);
    };

    const handleCellBlur = () => {
        setEditingCell(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent, id: string, field: string) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            const fields = activeTab === "food"
                ? ['name', 'unit_quantity', 'price_incl_tax', 'calories', 'protein', 'fat', 'carbohydrate', 'sodium', 'supplier']
                : ['name', 'unit_quantity', 'price_incl_tax', 'supplier'];

            const currentIndex = fields.indexOf(field);
            if (currentIndex >= 0 && currentIndex < fields.length - 1) {
                setEditingCell({ id, field: fields[currentIndex + 1] });
            } else {
                setEditingCell(null);
            }
        }
        if (e.key === 'Escape') {
            setEditingCell(null);
        }
    };

    const addNewRow = () => {
        // タブに応じたデフォルトカテゴリを選択
        const defaultCategoryName = activeTab === "food" ? "その他" : "資材";
        const defaultCategory = categories.find(c => c.name === defaultCategoryName);

        const newIngredient: Ingredient = {
            id: `new-${Date.now()}`,
            name: "",
            category_id: defaultCategory?.id || null,
            category_name: defaultCategoryName,
            unit_quantity: 1000,
            price_incl_tax: null,
            price_excl_tax: null,
            price_per_gram: null,
            calories: null,
            protein: null,
            fat: null,
            carbohydrate: null,
            sodium: null,
            supplier: null,
            item_type: activeTab,
            isNew: true,
            isModified: true,
        };
        setIngredients(prev => [newIngredient, ...prev]);
        setHasChanges(true);
        setEditingCell({ id: newIngredient.id, field: 'name' });
    };

    const deleteRow = async (id: string) => {
        if (id.startsWith('new-')) {
            setIngredients(prev => prev.filter(ing => ing.id !== id));
        } else {
            if (confirm('この項目を削除しますか？')) {
                const { error } = await supabase.from('ingredients').delete().eq('id', id);
                if (error) {
                    toast.error('削除に失敗しました');
                } else {
                    setIngredients(prev => prev.filter(ing => ing.id !== id));
                    toast.success('削除しました');
                }
            }
        }
    };

    const saveChanges = async () => {
        const modifiedItems = ingredients.filter(ing => ing.isModified);

        for (const ing of modifiedItems) {
            const data = {
                name: ing.name,
                category_id: ing.category_id,
                unit_quantity: ing.unit_quantity,
                price_incl_tax: ing.price_incl_tax,
                price_excl_tax: ing.price_excl_tax,
                price_per_gram: ing.price_per_gram,
                calories: ing.calories,
                protein: ing.protein,
                fat: ing.fat,
                carbohydrate: ing.carbohydrate,
                sodium: ing.sodium,
                supplier: ing.supplier,
            };

            if (ing.isNew) {
                const { data: newData, error } = await supabase
                    .from('ingredients')
                    .insert(data)
                    .select()
                    .single();

                if (error) {
                    toast.error(`${ing.name}: 保存エラー`);
                    continue;
                }

                setIngredients(prev => prev.map(i =>
                    i.id === ing.id ? { ...i, id: newData.id, isNew: false, isModified: false } : i
                ));
            } else {
                const { error } = await supabase
                    .from('ingredients')
                    .update(data)
                    .eq('id', ing.id);

                if (error) {
                    toast.error(`${ing.name}: 更新エラー`);
                    continue;
                }

                setIngredients(prev => prev.map(i =>
                    i.id === ing.id ? { ...i, isModified: false } : i
                ));
            }
        }

        setHasChanges(false);
        toast.success('保存しました');
    };

    // 現在のタブとフィルタに基づいてフィルタリング
    const filteredIngredients = ingredients.filter(ing => {
        const matchesSearch = ing.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === 'all' || ing.category_id === selectedCategory;
        const matchesTab = ing.item_type === activeTab;
        return matchesSearch && matchesCategory && matchesTab;
    });

    // タブに応じたカテゴリリストを取得
    const tabCategories = categories.filter(cat =>
        activeTab === "food"
            ? FOOD_CATEGORIES.includes(cat.name)
            : MATERIAL_CATEGORIES.includes(cat.name)
    );

    // 各タブのアイテム数
    const foodCount = ingredients.filter(i => i.item_type === "food").length;
    const materialCount = ingredients.filter(i => i.item_type === "material").length;

    const formatNumber = (value: number | null, decimals = 2) => {
        if (value === null || value === undefined) return '';
        return value.toFixed(decimals);
    };

    const renderCell = (ing: Ingredient, field: string, displayValue: string, width: string = 'w-24') => {
        const isEditing = editingCell?.id === ing.id && editingCell?.field === field;

        if (isEditing) {
            return (
                <input
                    ref={inputRef}
                    type="text"
                    defaultValue={displayValue}
                    onBlur={(e) => {
                        handleCellChange(ing.id, field, e.target.value);
                        handleCellBlur();
                    }}
                    onKeyDown={(e) => handleKeyDown(e, ing.id, field)}
                    className={`${width} px-2 py-1 border border-blue-500 rounded text-sm focus:outline-none`}
                />
            );
        }

        return (
            <div
                className={`${width} px-2 py-1 cursor-pointer hover:bg-blue-50 rounded ${ing.isModified ? 'bg-yellow-50' : ''}`}
                onClick={() => handleCellDoubleClick(ing.id, field)}
            >
                {displayValue || <span className="text-gray-300">-</span>}
            </div>
        );
    };

    const tabs = [
        { key: "food" as TabType, label: "食材", icon: Apple, count: foodCount },
        { key: "material" as TabType, label: "資材", icon: Box, count: materialCount },
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
                            材料・資材データベース
                        </h1>
                        <p className="text-gray-600 text-sm">ダブルクリックで編集</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button onClick={addNewRow} variant="outline">
                        <Plus className="w-4 h-4 mr-2" />
                        新規追加
                    </Button>
                    {hasChanges && (
                        <Button onClick={saveChanges}>
                            <Save className="w-4 h-4 mr-2" />
                            変更を保存
                        </Button>
                    )}
                </div>
            </div>

            {/* Tabs - 食材 / 資材 */}
            <div className="flex border-b border-gray-300 mb-4">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => {
                                setActiveTab(tab.key);
                                setSelectedCategory("all");
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

            {/* Filters */}
            <div className="flex gap-4 mb-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                        placeholder={activeTab === "food" ? "食材を検索..." : "資材を検索..."}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="カテゴリ" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全てのカテゴリ</SelectItem>
                        {tabCategories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto bg-white border border-gray-300 border-t-0 rounded-b-lg">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-100 z-10">
                        <tr className="border-b">
                            <th className="px-2 py-2 text-left w-10">NO</th>
                            <th className="px-2 py-2 text-left min-w-[200px]">{activeTab === "food" ? "食材名" : "資材名"}</th>
                            <th className="px-2 py-2 text-left w-24">カテゴリ</th>
                            <th className="px-2 py-2 text-right w-24">入数(g)</th>
                            <th className="px-2 py-2 text-right w-24">税込単価</th>
                            <th className="px-2 py-2 text-right w-24">g単価</th>
                            {activeTab === "food" && (
                                <>
                                    <th className="px-2 py-2 text-right w-20">熱量</th>
                                    <th className="px-2 py-2 text-right w-20">タンパク</th>
                                    <th className="px-2 py-2 text-right w-20">脂質</th>
                                    <th className="px-2 py-2 text-right w-20">炭水化物</th>
                                    <th className="px-2 py-2 text-right w-20">食塩</th>
                                </>
                            )}
                            <th className="px-2 py-2 text-left w-28">仕入先</th>
                            <th className="px-2 py-2 w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={activeTab === "food" ? 13 : 8} className="text-center py-8 text-gray-500">
                                    読み込み中...
                                </td>
                            </tr>
                        ) : filteredIngredients.length === 0 ? (
                            <tr>
                                <td colSpan={activeTab === "food" ? 13 : 8} className="text-center py-8 text-gray-500">
                                    {activeTab === "food" ? "食材がありません" : "資材がありません"}
                                </td>
                            </tr>
                        ) : (
                            filteredIngredients.map((ing, index) => (
                                <tr
                                    key={ing.id}
                                    className={`border-b hover:bg-gray-50 ${ing.isNew ? 'bg-green-50' : ''} ${ing.isModified && !ing.isNew ? 'bg-yellow-50' : ''}`}
                                >
                                    <td className="px-2 py-1 text-gray-500">{index + 1}</td>
                                    <td className="px-0 py-1">{renderCell(ing, 'name', ing.name, 'min-w-[180px]')}</td>
                                    <td className="px-2 py-1">
                                        <Select
                                            value={ing.category_id || ''}
                                            onValueChange={(v) => handleCellChange(ing.id, 'category_id', v)}
                                        >
                                            <SelectTrigger className="h-7 text-xs">
                                                <SelectValue placeholder="-" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {tabCategories.map((cat) => (
                                                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="px-0 py-1 text-right">{renderCell(ing, 'unit_quantity', formatNumber(ing.unit_quantity, 0))}</td>
                                    <td className="px-0 py-1 text-right">{renderCell(ing, 'price_incl_tax', formatNumber(ing.price_incl_tax, 0))}</td>
                                    <td className="px-2 py-1 text-right text-gray-500">
                                        {ing.price_per_gram ? `¥${ing.price_per_gram.toFixed(4)}` : '-'}
                                    </td>
                                    {activeTab === "food" && (
                                        <>
                                            <td className="px-0 py-1 text-right">{renderCell(ing, 'calories', formatNumber(ing.calories, 1))}</td>
                                            <td className="px-0 py-1 text-right">{renderCell(ing, 'protein', formatNumber(ing.protein, 1))}</td>
                                            <td className="px-0 py-1 text-right">{renderCell(ing, 'fat', formatNumber(ing.fat, 1))}</td>
                                            <td className="px-0 py-1 text-right">{renderCell(ing, 'carbohydrate', formatNumber(ing.carbohydrate, 1))}</td>
                                            <td className="px-0 py-1 text-right">{renderCell(ing, 'sodium', formatNumber(ing.sodium, 2))}</td>
                                        </>
                                    )}
                                    <td className="px-0 py-1">{renderCell(ing, 'supplier', ing.supplier || '', 'w-28')}</td>
                                    <td className="px-2 py-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => deleteRow(ing.id)}
                                            className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
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
