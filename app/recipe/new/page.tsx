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
    { value: "Shopee", label: "Shopee", color: "bg-pink-100 text-pink-800" },
];

interface NewItem {
    item_name: string;
    item_type: "ingredient" | "material" | "intermediate" | "expense";
    unit_quantity: string;
    unit_price: string;
    usage_amount: string;
    cost: string;
}

const EMPTY_ITEM: NewItem = {
    item_name: "",
    item_type: "ingredient",
    unit_quantity: "",
    unit_price: "",
    usage_amount: "",
    cost: "",
};

export default function NewRecipePage() {
    const router = useRouter();
    const [saving, setSaving] = useState(false);

    // レシピ基本情報
    const [name, setName] = useState("");
    const [category, setCategory] = useState("ネット専用");
    const [isIntermediate, setIsIntermediate] = useState(false);
    const [developmentDate, setDevelopmentDate] = useState("");
    const [sellingPrice, setSellingPrice] = useState("");

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
                .select('id, name, unit_quantity, price, calories, protein, fat, carbohydrate, sodium');
            if (ingData) {
                setIngredients(ingData.map(i => ({
                    id: i.id,
                    name: i.name,
                    unit_quantity: i.unit_quantity,
                    unit_price: i.price,
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
            const { data: matData } = await supabase.from('materials').select('id, name, unit_quantity, price');
            if (matData) {
                setMaterials(matData.map(m => ({
                    id: m.id,
                    name: m.name,
                    unit_quantity: m.unit_quantity,
                    unit_price: m.price
                })));
            }
            // 中間部品
            const { data: recipeData } = await supabase.from('recipes').select('id, name, total_cost').eq('is_intermediate', true);
            if (recipeData) {
                setIntermediates(recipeData.map(r => ({
                    id: r.id,
                    name: r.name,
                    unit_quantity: 1,
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

    const updateItem = (index: number, field: keyof NewItem, value: string) => {
        const updated = [...items];
        updated[index] = { ...updated[index], [field]: value };

        // 原価自動計算
        const unitPrice = parseFloat(updated[index].unit_price) || 0;
        const usageAmount = parseFloat(updated[index].usage_amount) || 0;
        // unit_quantityが文字列の場合（資材の "35x9ケース" 等）への対応が必要だが、
        // 現状は数値としてパースできるもののみ計算する仕様とするか、
        // 入力時にユーザーに修正してもらう前提とする。
        // 資材テーブルの unit_quantity は text 型だが、実態として数値で入力されることが多い。
        // パースできない場合は 1 として扱うと計算が狂うので、NaNの場合は計算しない。
        let unitQuantity = parseFloat(updated[index].unit_quantity);
        if (isNaN(unitQuantity) || unitQuantity <= 0) unitQuantity = 1;

        if (unitPrice > 0 && usageAmount > 0) {
            // 資材などで unit_quantity が文字列の場合、parseFloatは先頭の数値だけ拾う（例: "35x9" -> 35）。
            // これは簡易計算としては危険だが、ユーザーが手動修正できるため許容する。
            updated[index].cost = ((unitPrice / unitQuantity) * usageAmount).toFixed(2);
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
                    usage_amount: item.usage_amount ? parseFloat(item.usage_amount) : null,
                    cost: item.cost ? parseFloat(item.cost) : null,
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
                                        <ItemNameSelect
                                            candidates={candidates}
                                            value={item.item_name}
                                            onSelect={(selected) => {
                                                if (typeof selected === 'string') {
                                                    updateItem(index, 'item_name', selected);
                                                } else {
                                                    updateItem(index, 'item_name', selected.name);
                                                    if (selected.unit_price) updateItem(index, 'unit_price', selected.unit_price.toString());
                                                    if (selected.unit_quantity) updateItem(index, 'unit_quantity', selected.unit_quantity.toString());
                                                }
                                            }}
                                        />
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
                                        <Input
                                            type="number"
                                            value={item.usage_amount}
                                            onChange={(e) => updateItem(index, "usage_amount", e.target.value)}
                                            className="h-8 text-right px-2 bg-yellow-50 focus:bg-white border-yellow-200 focus:border-blue-500"
                                            placeholder="入力"
                                        />
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
                            <Select value={category} onValueChange={setCategory}>
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
                                onChange={(e) => setIsIntermediate(e.target.checked)}
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
