// app/recipe/new/page.tsx
// レシピ新規作成ページ

"use client";

import { useState } from "react";
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

const ITEM_TYPES = [
    { value: "ingredient", label: "食材", color: "bg-green-100 text-green-800" },
    { value: "material", label: "資材", color: "bg-orange-100 text-orange-800" },
    { value: "intermediate", label: "中間部品", color: "bg-purple-100 text-purple-800" },
    { value: "expense", label: "経費", color: "bg-red-100 text-red-800" },
];

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

    const addItem = (type: NewItem["item_type"] = "ingredient") => {
        setItems([...items, { ...EMPTY_ITEM, item_type: type }]);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: keyof NewItem, value: string) => {
        const updated = [...items];
        updated[index] = { ...updated[index], [field]: value };

        // 原価自動計算: 単価 × 使用量 / 入数
        if (field === "unit_price" || field === "usage_amount" || field === "unit_quantity") {
            const unitPrice = parseFloat(updated[index].unit_price) || 0;
            const usageAmount = parseFloat(updated[index].usage_amount) || 0;
            const unitQuantity = parseFloat(updated[index].unit_quantity) || 1;
            if (unitPrice > 0 && usageAmount > 0 && unitQuantity > 0) {
                updated[index].cost = ((unitPrice / unitQuantity) * usageAmount).toFixed(2);
            }
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
            // 1. レシピを作成
            const { data: recipeData, error: recipeError } = await supabase
                .from("recipes")
                .insert({
                    name: name.trim(),
                    category,
                    is_intermediate: isIntermediate,
                    development_date: developmentDate || null,
                    selling_price: sellingPrice ? parseFloat(sellingPrice) : null,
                    total_cost: totalCost,
                    source_file: null,
                })
                .select()
                .single();

            if (recipeError) throw recipeError;

            // 2. アイテムを作成
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

    return (
        <div>
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
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
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="text-lg">基本情報</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
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
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
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
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
                                開発日
                            </label>
                            <Input
                                type="date"
                                value={developmentDate}
                                onChange={(e) => setDevelopmentDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">
                                販売価格
                            </label>
                            <Input
                                type="number"
                                placeholder="例: 1500"
                                value={sellingPrice}
                                onChange={(e) => setSellingPrice(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="isIntermediate"
                                checked={isIntermediate}
                                onChange={(e) => setIsIntermediate(e.target.checked)}
                                className="w-4 h-4"
                            />
                            <label htmlFor="isIntermediate" className="text-sm font-medium text-gray-700">
                                中間部品【P】として登録
                            </label>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Items */}
            <Card className="mb-6">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">材料・経費</CardTitle>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => addItem("ingredient")}>
                                <Plus className="w-3 h-3 mr-1" />
                                食材
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => addItem("material")}>
                                <Plus className="w-3 h-3 mr-1" />
                                資材
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => addItem("intermediate")}>
                                <Plus className="w-3 h-3 mr-1" />
                                中間部品
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => addItem("expense")}>
                                <Plus className="w-3 h-3 mr-1" />
                                経費
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr className="border-b">
                                    <th className="px-2 py-2 text-left w-8">NO</th>
                                    <th className="px-2 py-2 text-left w-24">種類</th>
                                    <th className="px-2 py-2 text-left min-w-[200px]">名称</th>
                                    <th className="px-2 py-2 text-right w-24">入数</th>
                                    <th className="px-2 py-2 text-right w-24">単価</th>
                                    <th className="px-2 py-2 text-right w-24">使用量</th>
                                    <th className="px-2 py-2 text-right w-24">原価</th>
                                    <th className="px-2 py-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => (
                                    <tr key={idx} className="border-b hover:bg-gray-50">
                                        <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                        <td className="px-2 py-1">
                                            <Select
                                                value={item.item_type}
                                                onValueChange={(v) => updateItem(idx, "item_type", v)}
                                            >
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ITEM_TYPES.map((t) => (
                                                        <SelectItem key={t.value} value={t.value}>
                                                            <span className={`px-1 py-0.5 rounded text-xs ${t.color}`}>
                                                                {t.label}
                                                            </span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </td>
                                        <td className="px-2 py-1">
                                            <Input
                                                placeholder="名称を入力"
                                                value={item.item_name}
                                                onChange={(e) => updateItem(idx, "item_name", e.target.value)}
                                                className="h-8 text-sm"
                                            />
                                        </td>
                                        <td className="px-2 py-1">
                                            <Input
                                                type="number"
                                                placeholder="入数"
                                                value={item.unit_quantity}
                                                onChange={(e) => updateItem(idx, "unit_quantity", e.target.value)}
                                                className="h-8 text-sm text-right"
                                            />
                                        </td>
                                        <td className="px-2 py-1">
                                            <Input
                                                type="number"
                                                placeholder="単価"
                                                value={item.unit_price}
                                                onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                                                className="h-8 text-sm text-right"
                                            />
                                        </td>
                                        <td className="px-2 py-1">
                                            <Input
                                                type="number"
                                                placeholder="使用量"
                                                value={item.usage_amount}
                                                onChange={(e) => updateItem(idx, "usage_amount", e.target.value)}
                                                className="h-8 text-sm text-right"
                                            />
                                        </td>
                                        <td className="px-2 py-1">
                                            <Input
                                                type="number"
                                                placeholder="原価"
                                                value={item.cost}
                                                onChange={(e) => updateItem(idx, "cost", e.target.value)}
                                                className="h-8 text-sm text-right bg-gray-50"
                                            />
                                        </td>
                                        <td className="px-2 py-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeItem(idx)}
                                                className="h-8 w-8 p-0 text-red-400 hover:text-red-600"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {items.length === 0 && (
                        <div className="text-center py-8 text-gray-400">
                            上のボタンから材料を追加してください
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Summary */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex justify-between items-center">
                        <div className="flex gap-8 text-sm">
                            <span>食材: <strong>{items.filter(i => i.item_type === "ingredient").length}</strong>種類</span>
                            <span>資材: <strong>{items.filter(i => i.item_type === "material").length}</strong>種類</span>
                            <span>中間部品: <strong>{items.filter(i => i.item_type === "intermediate").length}</strong>種類</span>
                            <span>経費: <strong>{items.filter(i => i.item_type === "expense").length}</strong>種類</span>
                        </div>
                        <div className="flex items-center gap-6">
                            <div>
                                <span className="text-sm text-gray-500">総原価: </span>
                                <span className="text-xl font-bold text-blue-600">
                                    ¥{Math.round(totalCost).toLocaleString()}
                                </span>
                            </div>
                            {sellingPrice && (
                                <div>
                                    <span className="text-sm text-gray-500">原価率: </span>
                                    <span className="text-xl font-bold text-green-600">
                                        {((totalCost / parseFloat(sellingPrice)) * 100).toFixed(1)}%
                                    </span>
                                </div>
                            )}
                            <Button onClick={handleSave} disabled={saving || !name.trim()}>
                                <Save className="w-4 h-4 mr-2" />
                                {saving ? "保存中..." : "保存"}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
