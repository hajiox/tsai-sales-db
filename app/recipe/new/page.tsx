// app/recipe/new/page.tsx
// レシピ新規作成ページ v2

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Save, ChefHat } from "lucide-react";
import { toast } from "sonner";
import ItemNameSelect, { ItemCandidate } from "../_components/ItemNameSelect";
import NutritionDisplay from "../_components/NutritionDisplay";

const CATEGORIES = [
    { value: "ネット専用", label: "ネット専用", color: "bg-blue-100 text-blue-800" },
    { value: "自社", label: "自社", color: "bg-green-100 text-green-800" },
    { value: "OEM", label: "OEM", color: "bg-orange-100 text-orange-800" },
    { value: "中間部品", label: "中間部品", color: "bg-purple-100 text-purple-800" },
    { value: "終売", label: "終売", color: "bg-gray-500 text-white" },
    { value: "試作", label: "試作", color: "bg-gray-100 text-gray-800" },
    { value: "Shopee", label: "Shopee", color: "bg-pink-100 text-pink-800" },
];

interface NewItem {
    item_name: string;
    item_type: "ingredient" | "material" | "intermediate" | "expense";
    unit_quantity: string;
    unit_price: string;
    unit_weight?: number;
    usage_amount: string;
    cost: string;
    tax_included?: boolean;
}

const EMPTY_ITEM: NewItem = {
    item_name: "",
    item_type: "ingredient",
    unit_quantity: "",
    unit_price: "",
    unit_weight: 0,
    usage_amount: "",
    cost: "",
    tax_included: true,
};

export default function NewRecipePage() {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [taxRates, setTaxRates] = useState({ ingredient: 8, material: 10 });

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

    // レシピ基本情報
    const [name, setName] = useState("");
    const [category, setCategory] = useState("ネット専用");
    const [isIntermediate, setIsIntermediate] = useState(false);
    const [developmentDate, setDevelopmentDate] = useState("");
    const [sellingPrice, setSellingPrice] = useState("");

    const handleCategoryChange = (val: string) => {
        setCategory(val);
        if (val === "中間部品") {
            setIsIntermediate(true);
        }
    };

    const handleIsIntermediateChange = (checked: boolean) => {
        setIsIntermediate(checked);
        if (checked) {
            setCategory("中間部品");
        } else if (category === "中間部品") {
            setCategory("ネット専用");
        }
    };

    // アイテム
    const [items, setItems] = useState<NewItem[]>([{ ...EMPTY_ITEM }]);

    // マスターデータ
    const [ingredients, setIngredients] = useState<ItemCandidate[]>([]);
    const [materials, setMaterials] = useState<ItemCandidate[]>([]);
    const [intermediates, setIntermediates] = useState<ItemCandidate[]>([]);
    const [expenses, setExpenses] = useState<ItemCandidate[]>([]);

    useEffect(() => {
        const fetchMasterData = async () => {
            // 食材
            const { data: ingData } = await supabase
                .from('ingredients')
                .select('id, name, unit_quantity, price, calories, protein, fat, carbohydrate, sodium, tax_included');
            if (ingData) {
                setIngredients(ingData.map(i => ({
                    id: i.id,
                    name: i.name,
                    unit_quantity: i.unit_quantity,
                    unit_price: i.price,
                    tax_included: i.tax_included !== false,
                    nutrition: {
                        calories: i.calories,
                        protein: i.protein,
                        fat: i.fat,
                        carbohydrate: i.carbohydrate,
                        sodium: i.sodium,
                    }
                })));
            }
            // 資材
            const { data: matData } = await supabase.from('materials').select('id, name, unit_quantity, price, tax_included');
            if (matData) {
                setMaterials(matData.map(m => ({
                    id: m.id,
                    name: m.name,
                    unit_quantity: m.unit_quantity,
                    unit_price: m.price,
                    tax_included: m.tax_included !== false
                })));
            }
            // 中間部品
            const { data: recipeData } = await supabase.from('recipes').select('id, name, total_cost, total_weight').eq('is_intermediate', true);
            if (recipeData) {
                setIntermediates(recipeData.map(r => ({
                    id: r.id,
                    name: r.name,
                    unit_quantity: 1,
                    unit_weight: r.total_weight ?? 0,
                    unit_price: r.total_cost
                })));
            }
            // 経費（仮）
            setExpenses([
                { name: "ヤマト送料", unit_price: 950, unit_quantity: 1 },
                { name: "ネコポス送料", unit_price: 350, unit_quantity: 1 },
                { name: "コンパクト送料", unit_price: 550, unit_quantity: 1 },
                { name: "人件費", unit_price: 1200, unit_quantity: 1 },
            ]);
        };
        fetchMasterData();
    }, []);


    const addItem = (type: NewItem["item_type"]) => {
        setItems([...items, { ...EMPTY_ITEM, item_type: type }]);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: string, value: any) => {
        const updated = [...items];
        updated[index] = { ...updated[index], [field]: value };

        // 原価自動計算
        const unitPrice = parseFloat(updated[index].unit_price) || 0;
        const usageAmount = parseFloat(updated[index].usage_amount) || 0;
        let unitQuantity = parseFloat(updated[index].unit_quantity);
        if (isNaN(unitQuantity) || unitQuantity <= 0) unitQuantity = 1;

        if (unitPrice > 0 && usageAmount > 0) {
            // Apply tax rate if not included
            const rate =
                updated[index].item_type === "ingredient" && !updated[index].tax_included
                    ? (1 + (taxRates.ingredient / 100))
                    : updated[index].item_type === "material" && !updated[index].tax_included
                        ? (1 + (taxRates.material / 100))
                        : 1.0;

            updated[index].cost = ((unitPrice / unitQuantity) * usageAmount * rate).toFixed(2);
        }

        setItems(updated);
    };

    const totalCost = items.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error("レシピ名を入力してください");
            return;
        }

        setSaving(true);

        try {
            const { data: recipeData, error: recipeError } = await supabase
                .from("recipes")
                .insert({
                    name: name.trim(),
                    category,
                    is_intermediate: isIntermediate,
                    development_date: developmentDate || null,
                    selling_price: sellingPrice ? parseFloat(sellingPrice) : null,
                    total_cost: totalCost,
                    total_weight: items.reduce((sum, item) => {
                        if (["ingredient", "intermediate"].includes(item.item_type)) {
                            const usage = parseFloat(item.usage_amount) || 0;
                            return sum + (item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0));
                        }
                        return sum;
                    }, 0),
                })
                .select()
                .single();

            if (recipeError) throw recipeError;

            const validItems = items.filter(item => item.item_name.trim());
            if (validItems.length > 0) {
                const itemRows = validItems.map(item => ({
                    recipe_id: recipeData.id,
                    item_name: item.item_name.trim(),
                    item_type: item.item_type,
                    unit_quantity: item.unit_quantity ? parseFloat(item.unit_quantity) : null,
                    unit_price: item.unit_price ? parseFloat(item.unit_price) : null,
                    unit_weight: item.unit_weight ? item.unit_weight : null,
                    usage_amount: item.usage_amount ? parseFloat(item.usage_amount) : null,
                    cost: item.cost ? parseFloat(item.cost) : null,
                    tax_included: item.tax_included ?? true
                }));

                const { error: itemsError } = await supabase
                    .from("recipe_items")
                    .insert(itemRows);

                if (itemsError) throw itemsError;
            }

            toast.success("レシピを作成しました");
            router.push(`/recipe/${recipeData.id}`);
        } catch (error) {
            console.error("Save error:", error);
            toast.error("レシピの作成に失敗しました");
        } finally {
            setSaving(false);
        }
    };

    const renderSection = (
        title: string,
        type: NewItem["item_type"],
        bgClass: string,
        textClass: string,
        candidates: ItemCandidate[]
    ) => {
        const filteredWithIndex = items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.item_type === type);

        return (
            <div className="mb-6">
                <div className={`px-4 py-2 border-b font-medium flex justify-between items-center ${bgClass} ${textClass}`}>
                    <span>{title} ({filteredWithIndex.length})</span>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs bg-white/50 hover:bg-white/80"
                        onClick={() => addItem(type)}
                    >
                        <Plus className="w-3 h-3 mr-1" /> 追加
                    </Button>
                </div>
                <div className="overflow-x-auto border-x border-b rounded-b-md bg-white">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-700">
                            <tr className="border-b">
                                <th className="px-3 py-2 text-left w-12 text-xs font-semibold">NO</th>
                                <th className="px-3 py-2 text-left min-w-[200px] text-xs font-semibold">名称</th>
                                <th className="px-3 py-2 text-right w-24 text-xs font-semibold">入数</th>
                                <th className="px-3 py-2 text-right w-28 text-xs font-semibold">単価</th>
                                <th className="px-3 py-2 text-right w-24 text-xs font-semibold">使用量</th>
                                <th className="px-3 py-2 text-right w-28 text-xs font-semibold">原価</th>
                                <th className="px-3 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredWithIndex.map(({ item, index }, localIdx) => (
                                <tr key={index} className="border-b hover:bg-gray-50 last:border-0">
                                    <td className="px-3 py-2 text-gray-500 text-center">{localIdx + 1}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1">
                                                <ItemNameSelect
                                                    candidates={candidates}
                                                    value={item.item_name}
                                                    onSelect={(selected) => {
                                                        if (typeof selected === 'string') {
                                                            updateItem(index, 'item_name', selected);
                                                        } else {
                                                            const updates: any = {
                                                                item_name: selected.name,
                                                                unit_price: selected.unit_price?.toString() || "",
                                                                unit_quantity: selected.unit_quantity?.toString() || "",
                                                                unit_weight: selected.unit_weight || 0,
                                                                tax_included: (selected as any).tax_included !== false
                                                            };
                                                            // We need to update multiple fields at once, so let's modify updateItem to accept multiple or just call it multiple times.
                                                            // Actually updateItem currently takes field and value. Let's do a quick hack.
                                                            const updatedList = [...items];
                                                            updatedList[index] = { ...updatedList[index], ...updates };

                                                            // Recalculate cost
                                                            const uPrice = parseFloat(updates.unit_price) || 0;
                                                            const uUsage = parseFloat(updatedList[index].usage_amount) || 0;
                                                            let uQty = parseFloat(updates.unit_quantity);
                                                            if (isNaN(uQty) || uQty <= 0) uQty = 1;
                                                            const rate = (updates.item_type || type) === "ingredient" && updates.tax_included === false ? (1 + (taxRates.ingredient / 100)) : (updates.item_type || type) === "material" && updates.tax_included === false ? (1 + (taxRates.material / 100)) : 1.0;
                                                            if (uPrice > 0 && uUsage > 0) {
                                                                updatedList[index].cost = ((uPrice / uQty) * uUsage * rate).toFixed(2);
                                                            }
                                                            updatedList[index].unit_weight = updates.unit_weight;
                                                            setItems(updatedList);
                                                        }
                                                    }}
                                                />
                                            </div>
                                            {['ingredient', 'material'].includes(type) && (
                                                <button
                                                    onClick={() => updateItem(index, 'tax_included', !item.tax_included)}
                                                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold border transition shrink-0 ${item.tax_included !== false ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}
                                                    title={item.tax_included !== false ? '税込 (クリックで税抜)' : '税抜 (クリックで税込)'}
                                                >
                                                    {item.tax_included !== false ? '込' : '抜'}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <Input
                                            type="number"
                                            value={item.unit_quantity}
                                            onChange={(e) => updateItem(index, "unit_quantity", e.target.value)}
                                            className="h-8 text-right px-2"
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        <Input
                                            type="number"
                                            value={item.unit_price}
                                            onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                                            className="h-8 text-right px-2"
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-1">
                                            <Input
                                                type="number"
                                                value={item.usage_amount}
                                                onChange={(e) => updateItem(index, "usage_amount", e.target.value)}
                                                className="h-8 text-right px-2 bg-yellow-50 focus:bg-white border-yellow-200 focus:border-blue-500"
                                                placeholder="入力"
                                            />
                                            <span className="text-xs text-gray-400 w-4">
                                                {type === "intermediate" ? "個" : "g"}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <Input
                                            type="number"
                                            value={item.cost}
                                            onChange={(e) => updateItem(index, "cost", e.target.value)}
                                            className="h-8 text-right px-2 bg-gray-100 border-transparent"
                                            readOnly // Cost is auto-calculated but editable if needed? User requested auto, usually read-only or manual override. Let's keep editable for flexibility but styled as read-only-ish.
                                            tabIndex={-1}
                                        />
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeItem(index)}
                                            className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {filteredWithIndex.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-6 text-gray-400 text-sm">
                                        アイテムがありません
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const itemsWithNutrition = items.map(item => {
        // 食材マスターから栄養成分を取得
        const matchingIngredient = ingredients.find(ing => ing.name === item.item_name);
        return {
            item_name: item.item_name,
            item_type: item.item_type,
            usage_amount: parseFloat(item.usage_amount) || 0,
            nutrition: matchingIngredient?.nutrition
        };
    });

    return (
        <div className="max-w-5xl mx-auto pb-40">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between sticky top-0 z-10 bg-white/80 backdrop-blur-sm py-4 border-b">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.push("/recipe")}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        戻る
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <ChefHat className="w-6 h-6" />
                            新規レシピ作成
                        </h1>
                    </div>
                </div>
                <Button onClick={handleSave} disabled={saving || !name.trim()}>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "保存中..." : "レシピを保存"}
                </Button>
            </div>

            {/* Basic Info */}
            <Card className="mb-8 shadow-sm">
                <CardHeader className="bg-gray-50 border-b py-3">
                    <CardTitle className="text-base font-medium text-gray-700">基本情報</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="col-span-1 md:col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                                レシピ名 <span className="text-red-500">*</span>
                            </label>
                            <Input
                                placeholder="例: 【商品】パーフェクトラーメンBUTA"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="text-base"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                                カテゴリー
                            </label>
                            <Select value={category} onValueChange={handleCategoryChange}>
                                <SelectTrigger>
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
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                                開発日
                            </label>
                            <Input
                                type="date"
                                value={developmentDate}
                                onChange={(e) => setDevelopmentDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                                販売価格
                            </label>
                            <Input
                                type="number"
                                placeholder="例: 1500"
                                value={sellingPrice}
                                onChange={(e) => setSellingPrice(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 pt-6">
                            <input
                                type="checkbox"
                                id="isIntermediate"
                                checked={isIntermediate}
                                onChange={(e) => handleIsIntermediateChange(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="isIntermediate" className="text-sm font-medium text-gray-700 cursor-pointer">
                                中間部品【P】として登録
                            </label>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Sections */}
            <div className="space-y-2">
                {renderSection("食材", "ingredient", "bg-green-50", "text-green-800", ingredients)}
                {renderSection("資材", "material", "bg-orange-50", "text-orange-800", materials)}
                {renderSection("中間部品", "intermediate", "bg-purple-50", "text-purple-800", intermediates)}
                {renderSection("経費", "expense", "bg-red-50", "text-red-800", expenses)}
            </div>

            {/* Nutrition Display */}
            <NutritionDisplay items={itemsWithNutrition} />

            {/* Summary Footer */}
            <Card className="fixed bottom-0 left-0 right-0 border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20 rounded-none bg-white/95 backdrop-blur">
                <CardContent className="py-4 px-6 max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex gap-6 text-sm text-gray-600">
                        <span>食材: <strong>{items.filter(i => i.item_type === "ingredient").length}</strong></span>
                        <span>資材: <strong>{items.filter(i => i.item_type === "material").length}</strong></span>
                        <span>中間部品: <strong>{items.filter(i => i.item_type === "intermediate").length}</strong></span>
                        <span>経費: <strong>{items.filter(i => i.item_type === "expense").length}</strong></span>
                    </div>
                    <div className="flex items-center gap-8">
                        <div>
                            <span className="text-sm text-gray-500 mr-2">全体重量: </span>
                            <span className="text-xl font-bold text-gray-800">
                                {items.reduce((sum, item) => {
                                    if (["ingredient", "intermediate"].includes(item.item_type)) {
                                        const usage = parseFloat(item.usage_amount) || 0;
                                        return sum + (item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0));
                                    }
                                    return sum;
                                }, 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}g
                            </span>
                        </div>
                        <div>
                            <span className="text-sm text-gray-500 mr-2">総原価: </span>
                            <span className="text-2xl font-bold text-gray-900">
                                ¥{Math.round(totalCost).toLocaleString()}
                            </span>
                        </div>
                        {sellingPrice && (
                            <div>
                                <span className="text-sm text-gray-500 mr-2">原価率: </span>
                                <span className={`text-xl font-bold ${(totalCost / parseFloat(sellingPrice)) * 100 > 35 ? 'text-red-600' : 'text-green-600'
                                    }`}>
                                    {((totalCost / parseFloat(sellingPrice)) * 100).toFixed(1)}%
                                </span>
                            </div>
                        )}
                        <Button onClick={handleSave} disabled={saving || !name.trim()} size="lg" className="px-8 shadow-md">
                            <Save className="w-4 h-4 mr-2" />
                            {saving ? "保存中..." : "保存"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
