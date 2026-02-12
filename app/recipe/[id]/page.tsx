// app/recipe/[id]/page.tsx
// レシピ詳細ページ - 新スキーマ対応版

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Edit, Save, ChefHat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import NutritionDisplay, { NutritionData } from "../_components/NutritionDisplay";

// カテゴリー一覧
const CATEGORIES = [
    { value: "ネット専用", label: "ネット専用", color: "bg-blue-100 text-blue-800" },
    { value: "自社", label: "自社", color: "bg-green-100 text-green-800" },
    { value: "OEM", label: "OEM", color: "bg-orange-100 text-orange-800" },
    { value: "Shopee", label: "Shopee", color: "bg-pink-100 text-pink-800" },
];

interface Recipe {
    id: string;
    name: string;
    category: string;
    is_intermediate: boolean;
    development_date: string | null;
    selling_price: number | null;
    total_cost: number | null;
    source_file: string | null;
}

interface RecipeItem {
    id: string;
    recipe_id: string;
    item_name: string;
    item_type: string;
    unit_quantity: number | null;
    unit_price: number | null;
    usage_amount: number | null;
    cost: number | null;
}

type TabType = "items" | "cost" | "info";

export default function RecipeDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [items, setItems] = useState<RecipeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>("items");
    const [isEditing, setIsEditing] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [nutritionMap, setNutritionMap] = useState<Record<string, NutritionData>>({});

    useEffect(() => {
        if (params.id) {
            fetchRecipe(params.id as string);
        }
    }, [params.id]);

    const fetchRecipe = async (id: string) => {
        setLoading(true);

        // レシピ本体
        const { data: recipeData, error: recipeError } = await supabase
            .from("recipes")
            .select("*")
            .eq("id", id)
            .single();

        if (recipeError || !recipeData) {
            console.error("Recipe fetch error:", recipeError);
            setLoading(false);
            return;
        }

        setRecipe(recipeData);

        // レシピ材料
        const { data: itemsData } = await supabase
            .from("recipe_items")
            .select("*")
            .eq("recipe_id", id)
            .order("id");

        if (itemsData) {
            setItems(itemsData);

            // 栄養成分データの取得
            const ingredientNames = itemsData
                .filter(i => i.item_type === 'ingredient' || i.item_type === 'intermediate')
                .map(i => i.item_name);

            if (ingredientNames.length > 0) {
                const { data: nutritionData } = await supabase
                    .from('ingredients')
                    .select('name, calories, protein, fat, carbohydrate, sodium')
                    .in('name', ingredientNames);

                if (nutritionData) {
                    const map: Record<string, NutritionData> = {};
                    nutritionData.forEach(n => {
                        map[n.name] = {
                            calories: n.calories,
                            protein: n.protein,
                            fat: n.fat,
                            carbohydrate: n.carbohydrate,
                            sodium: n.sodium,
                        };
                    });
                    setNutritionMap(map);
                }
            }
        }

        setLoading(false);
    };

    const handleItemChange = (itemId: string, field: string, value: string) => {
        const numericFields = ['unit_quantity', 'unit_price', 'usage_amount', 'cost'];
        const newValue = numericFields.includes(field)
            ? (value === '' ? 0 : parseFloat(value))
            : value;

        setItems(prevItems => prevItems.map(item => {
            if (item.id === itemId) {
                const updatedItem = { ...item, [field]: newValue };

                // 原価再計算が必要な場合（経費以外）
                // 使用量、入数、単価のいずれかが変更されたら再計算
                if (['usage_amount', 'unit_quantity', 'unit_price'].includes(field) && item.item_type !== 'expense') {
                    const usage = typeof updatedItem.usage_amount === 'number' ? updatedItem.usage_amount : 0;
                    const qty = typeof updatedItem.unit_quantity === 'number' ? updatedItem.unit_quantity : 0;
                    const price = typeof updatedItem.unit_price === 'number' ? updatedItem.unit_price : 0;

                    if (qty !== 0) {
                        updatedItem.cost = Math.round(usage * (price / qty));
                    }
                }
                return updatedItem;
            }
            return item;
        }));
        setHasChanges(true);
    };

    const saveChanges = async () => {
        if (!recipe) return;

        try {
            // レシピ材料を更新
            for (const item of items) {
                await supabase
                    .from('recipe_items')
                    .update({
                        item_name: item.item_name,
                        usage_amount: item.usage_amount,
                        cost: item.cost,
                    })
                    .eq('id', item.id);
            }

            // 総コスト計算して更新
            const totalCost = items.reduce((sum, item) => sum + (item.cost || 0), 0);
            await supabase
                .from('recipes')
                .update({ total_cost: totalCost })
                .eq('id', recipe.id);

            toast.success('保存しました');
            setHasChanges(false);
            setIsEditing(false);
        } catch (error) {
            toast.error('保存に失敗しました');
        }
    };

    // カテゴリー変更
    const handleCategoryChange = async (newCategory: string) => {
        if (!recipe) return;

        try {
            const { error } = await supabase
                .from('recipes')
                .update({ category: newCategory })
                .eq('id', recipe.id);

            if (error) throw error;

            setRecipe({ ...recipe, category: newCategory });
            toast.success(`カテゴリーを「${newCategory}」に変更しました`);
        } catch (error) {
            toast.error('カテゴリー変更に失敗しました');
        }
    };

    const formatNumber = (value?: number | null, decimals = 2) => {
        if (value === undefined || value === null) return "";
        return value.toFixed(decimals);
    };

    const formatCurrency = (value?: number | null) => {
        if (value === undefined || value === null) return "-";
        return `¥${Math.round(value).toLocaleString()}`;
    };

    // 合計計算
    const getTotals = () => {
        return {
            usage: items.reduce((sum, item) => sum + (item.usage_amount || 0), 0),
            cost: items.reduce((sum, item) => sum + (item.cost || 0), 0),
        };
    };

    // アイテムタイプ別にグループ化
    const groupedItems = {
        ingredient: items.filter(i => i.item_type === 'ingredient'),
        material: items.filter(i => i.item_type === 'material'),
        intermediate: items.filter(i => i.item_type === 'intermediate'),
        expense: items.filter(i => i.item_type === 'expense'),
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">読み込み中...</div>
            </div>
        );
    }

    if (!recipe) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">レシピが見つかりません</div>
            </div>
        );
    }

    const totals = getTotals();

    const tabs: { key: TabType; label: string }[] = [
        { key: "items", label: "材料一覧" },
        { key: "cost", label: "原価計算" },
        { key: "info", label: "基本情報" },
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
                        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <ChefHat className="w-5 h-5" />
                            {recipe.is_intermediate && (
                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded text-xs mr-1">P</span>
                            )}
                            {recipe.name}
                        </h1>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                            <Select value={recipe.category} onValueChange={handleCategoryChange}>
                                <SelectTrigger className="w-[140px] h-7">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map((cat) => (
                                        <SelectItem key={cat.value} value={cat.value}>
                                            <span className={`px-2 py-0.5 rounded ${cat.color}`}>
                                                {cat.label}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <span>開発日: {recipe.development_date || "-"}</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    {hasChanges ? (
                        <Button onClick={saveChanges}>
                            <Save className="w-4 h-4 mr-2" />
                            変更を保存
                        </Button>
                    ) : (
                        <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
                            <Edit className="w-4 h-4 mr-2" />
                            {isEditing ? "編集終了" : "編集モード"}
                        </Button>
                    )}
                </div>
            </div>

            {/* Quick Stats Bar */}
            <div className="grid grid-cols-4 gap-4 mb-4">
                <Card className="p-3">
                    <div className="text-xs text-gray-500">販売価格</div>
                    <div className="text-lg font-bold">{formatCurrency(recipe.selling_price)}</div>
                </Card>
                <Card className="p-3">
                    <div className="text-xs text-gray-500">総原価</div>
                    <div className="text-lg font-bold text-blue-600">{formatCurrency(totals.cost)}</div>
                </Card>
                <Card className="p-3">
                    <div className="text-xs text-gray-500">材料数</div>
                    <div className="text-lg font-bold">{items.length}種類</div>
                </Card>
                <Card className="p-3">
                    <div className="text-xs text-gray-500">総使用量</div>
                    <div className="text-lg font-bold">{totals.usage.toFixed(0)}g</div>
                </Card>
            </div>

            {/* Excel-style Tabs */}
            <div className="flex border-b border-gray-300 mb-0">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 text-sm font-medium border-t border-l border-r rounded-t-lg -mb-px transition ${activeTab === tab.key
                            ? "bg-white border-gray-300 text-gray-900"
                            : "bg-gray-100 border-transparent text-gray-500 hover:text-gray-700"
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 bg-white border border-gray-300 border-t-0 rounded-b-lg overflow-auto">
                {activeTab === "items" && (
                    <div>
                        {/* Nutrition Display */}
                        <div className="px-4">
                            <NutritionDisplay items={items.map(item => ({
                                item_name: item.item_name,
                                item_type: item.item_type,
                                usage_amount: item.usage_amount,
                                nutrition: nutritionMap[item.item_name]
                            }))} />
                        </div>

                        {/* 食材セクション */}
                        {groupedItems.ingredient.length > 0 && (
                            <div className="mb-4">
                                <div className="px-3 py-2 bg-green-50 border-b font-medium text-green-800">
                                    食材 ({groupedItems.ingredient.length}種類)
                                </div>
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr className="border-b">
                                            <th className="px-3 py-2 text-left w-12">NO</th>
                                            <th className="px-3 py-2 text-left min-w-[200px]">材料名</th>
                                            <th className="px-3 py-2 text-right w-24">入数</th>
                                            <th className="px-3 py-2 text-right w-24">単価</th>
                                            <th className="px-3 py-2 text-right w-24">使用量(g)</th>
                                            <th className="px-3 py-2 text-right w-24">原価</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupedItems.ingredient.map((item, idx) => (
                                            <tr key={item.id} className="border-b hover:bg-gray-50">
                                                <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                                                <td className="px-3 py-2 font-medium">{item.item_name}</td>
                                                <td className="px-3 py-2 text-right">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            value={item.unit_quantity || ''}
                                                            onChange={(e) => handleItemChange(item.id, 'unit_quantity', e.target.value)}
                                                            className="w-24 text-right h-8 ml-auto"
                                                        />
                                                    ) : (
                                                        formatNumber(item.unit_quantity, 0)
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            value={item.unit_price || ''}
                                                            onChange={(e) => handleItemChange(item.id, 'unit_price', e.target.value)}
                                                            className="w-24 text-right h-8 ml-auto"
                                                        />
                                                    ) : (
                                                        formatCurrency(item.unit_price)
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            value={item.usage_amount || ''}
                                                            onChange={(e) => handleItemChange(item.id, 'usage_amount', e.target.value)}
                                                            className="w-24 text-right h-8 ml-auto"
                                                        />
                                                    ) : (
                                                        formatNumber(item.usage_amount, 1)
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right">{formatCurrency(item.cost)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 中間部品セクション */}
                        {groupedItems.intermediate.length > 0 && (
                            <div className="mb-4">
                                <div className="px-3 py-2 bg-purple-50 border-b font-medium text-purple-800">
                                    中間部品【P】 ({groupedItems.intermediate.length}種類)
                                </div>
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr className="border-b">
                                            <th className="px-3 py-2 text-left w-12">NO</th>
                                            <th className="px-3 py-2 text-left min-w-[200px]">部品名</th>
                                            <th className="px-3 py-2 text-right w-24">入数</th>
                                            <th className="px-3 py-2 text-right w-24">単価</th>
                                            <th className="px-3 py-2 text-right w-24">使用量(g)</th>
                                            <th className="px-3 py-2 text-right w-24">原価</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupedItems.intermediate.map((item, idx) => (
                                            <tr key={item.id} className="border-b hover:bg-gray-50">
                                                <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                                                <td className="px-3 py-2 font-medium">{item.item_name}</td>
                                                <td className="px-3 py-2 text-right">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            value={item.unit_quantity || ''}
                                                            onChange={(e) => handleItemChange(item.id, 'unit_quantity', e.target.value)}
                                                            className="w-24 text-right h-8 ml-auto"
                                                        />
                                                    ) : (
                                                        formatNumber(item.unit_quantity, 0)
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            value={item.unit_price || ''}
                                                            onChange={(e) => handleItemChange(item.id, 'unit_price', e.target.value)}
                                                            className="w-24 text-right h-8 ml-auto"
                                                        />
                                                    ) : (
                                                        formatCurrency(item.unit_price)
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            value={item.usage_amount || ''}
                                                            onChange={(e) => handleItemChange(item.id, 'usage_amount', e.target.value)}
                                                            className="w-24 text-right h-8 ml-auto"
                                                        />
                                                    ) : (
                                                        formatNumber(item.usage_amount, 1)
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right">{formatCurrency(item.cost)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 資材セクション */}
                        {groupedItems.material.length > 0 && (
                            <div className="mb-4">
                                <div className="px-3 py-2 bg-orange-50 border-b font-medium text-orange-800">
                                    資材 ({groupedItems.material.length}種類)
                                </div>
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr className="border-b">
                                            <th className="px-3 py-2 text-left w-12">NO</th>
                                            <th className="px-3 py-2 text-left min-w-[200px]">資材名</th>
                                            <th className="px-3 py-2 text-right w-24">入数</th>
                                            <th className="px-3 py-2 text-right w-24">単価</th>
                                            <th className="px-3 py-2 text-right w-24">使用量</th>
                                            <th className="px-3 py-2 text-right w-24">原価</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupedItems.material.map((item, idx) => (
                                            <tr key={item.id} className="border-b hover:bg-gray-50">
                                                <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                                                <td className="px-3 py-2 font-medium">{item.item_name}</td>
                                                <td className="px-3 py-2 text-right">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            value={item.unit_quantity || ''}
                                                            onChange={(e) => handleItemChange(item.id, 'unit_quantity', e.target.value)}
                                                            className="w-24 text-right h-8 ml-auto"
                                                        />
                                                    ) : (
                                                        formatNumber(item.unit_quantity, 0)
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            value={item.unit_price || ''}
                                                            onChange={(e) => handleItemChange(item.id, 'unit_price', e.target.value)}
                                                            className="w-24 text-right h-8 ml-auto"
                                                        />
                                                    ) : (
                                                        formatCurrency(item.unit_price)
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            value={item.usage_amount || ''}
                                                            onChange={(e) => handleItemChange(item.id, 'usage_amount', e.target.value)}
                                                            className="w-24 text-right h-8 ml-auto"
                                                        />
                                                    ) : (
                                                        formatNumber(item.usage_amount, 1)
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right">{formatCurrency(item.cost)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 経費セクション */}
                        {groupedItems.expense.length > 0 && (
                            <div className="mb-4">
                                <div className="px-3 py-2 bg-red-50 border-b font-medium text-red-800">
                                    経費（送料・人件費・光熱費など） ({groupedItems.expense.length}種類)
                                </div>
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr className="border-b">
                                            <th className="px-3 py-2 text-left w-12">NO</th>
                                            <th className="px-3 py-2 text-left min-w-[200px]">経費項目</th>
                                            <th className="px-3 py-2 text-right w-24">金額</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupedItems.expense.map((item, idx) => (
                                            <tr key={item.id} className="border-b hover:bg-gray-50">
                                                <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                                                <td className="px-3 py-2 font-medium">{item.item_name}</td>
                                                <td className="px-3 py-2 text-right">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            value={item.cost || ''}
                                                            onChange={(e) => handleItemChange(item.id, 'cost', e.target.value)}
                                                            className="w-24 text-right h-8 ml-auto"
                                                        />
                                                    ) : (
                                                        formatCurrency(item.cost)
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 合計行 */}
                        <div className="border-t-2 bg-gray-100 px-3 py-3">
                            <div className="flex justify-between items-center max-w-2xl">
                                <span className="font-bold">合計</span>
                                <div className="flex gap-8">
                                    <span>使用量: <strong>{totals.usage.toFixed(0)}g</strong></span>
                                    <span>原価: <strong className="text-blue-600">{formatCurrency(totals.cost)}</strong></span>
                                </div>
                            </div>
                        </div>

                        {items.length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                材料データがありません
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "cost" && (
                    <div className="p-4">
                        <h3 className="font-bold mb-4">原価計算</h3>
                        <div className="grid grid-cols-2 gap-4 max-w-lg">
                            <Card className="p-4">
                                <div className="text-sm text-gray-500">総原価</div>
                                <div className="text-2xl font-bold text-blue-600">{formatCurrency(totals.cost)}</div>
                            </Card>
                            <Card className="p-4">
                                <div className="text-sm text-gray-500">販売価格</div>
                                <div className="text-2xl font-bold text-green-600">{formatCurrency(recipe.selling_price)}</div>
                            </Card>
                        </div>
                        {recipe.selling_price && totals.cost > 0 && (
                            <div className="mt-6 p-4 bg-gray-50 rounded-lg max-w-lg">
                                <div className="text-sm text-gray-500 mb-2">利益分析</div>
                                <div className="flex justify-between items-center">
                                    <span className="font-medium">粗利</span>
                                    <span className="text-lg font-bold">
                                        {formatCurrency(recipe.selling_price - totals.cost)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                    <span className="font-medium">利益率</span>
                                    <span className={`text-lg font-bold ${((recipe.selling_price - totals.cost) / recipe.selling_price * 100) >= 40
                                        ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                        {(((recipe.selling_price - totals.cost) / recipe.selling_price) * 100).toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "info" && (
                    <div className="p-4">
                        <h3 className="font-bold mb-4">基本情報</h3>
                        <div className="grid grid-cols-2 gap-4 max-w-lg text-sm">
                            <div><span className="text-gray-500">商品名:</span> {recipe.name}</div>
                            <div><span className="text-gray-500">カテゴリ:</span> {recipe.category}</div>
                            <div><span className="text-gray-500">開発日:</span> {recipe.development_date || '-'}</div>
                            <div><span className="text-gray-500">中間部品:</span> {recipe.is_intermediate ? 'はい' : 'いいえ'}</div>
                            {recipe.source_file && (
                                <div className="col-span-2">
                                    <span className="text-gray-500">ソースファイル:</span> {recipe.source_file.replace("【重要】【製造】総合管理（新型）", "")}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
