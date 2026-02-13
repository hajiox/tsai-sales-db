// app/recipe/[id]/page.tsx
// レシピ詳細ページ - シングルページレイアウト & 印刷対応

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { ArrowLeft, Edit, Save, Printer } from "lucide-react";
import { toast } from "sonner";
import NutritionDisplay, { NutritionData } from "../_components/NutritionDisplay";

// カテゴリー一覧
const CATEGORIES = [
    { value: "ネット専用", label: "ネット", color: "bg-blue-100 text-blue-800 border-blue-200" },
    { value: "自社", label: "自社", color: "bg-green-100 text-green-800 border-green-200" },
    { value: "OEM", label: "OEM", color: "bg-orange-100 text-orange-800 border-orange-200" },
    { value: "Shopee", label: "Shopee", color: "bg-pink-100 text-pink-800 border-pink-200" },
];

interface Recipe {
    id: string;
    name: string;
    category: string;
    is_intermediate: boolean;
    development_date: string | null;
    manufacturing_notes: string | null;
    filling_quantity: number | null;
    storage_method: string | null;
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

export default function RecipeDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [items, setItems] = useState<RecipeItem[]>([]);
    const [loading, setLoading] = useState(true);
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

        const { data: itemsData } = await supabase
            .from("recipe_items")
            .select("*")
            .eq("recipe_id", id)
            .order("id");

        if (itemsData) {
            setItems(itemsData);

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

    const handleRecipeChange = async (field: keyof Recipe, value: any) => {
        if (!recipe) return;

        const updatedRecipe = { ...recipe, [field]: value };
        setRecipe(updatedRecipe);

        try {
            const { error } = await supabase
                .from('recipes')
                .update({ [field]: value })
                .eq('id', recipe.id);

            if (error) throw error;
            toast.success('更新しました', { duration: 1000 });
        } catch (error) {
            console.error('Update error:', error);
            toast.error('更新に失敗しました');
        }
    };

    const saveChanges = async () => {
        if (!recipe) return;

        try {
            for (const item of items) {
                await supabase
                    .from('recipe_items')
                    .update({
                        item_name: item.item_name,
                        unit_quantity: item.unit_quantity,
                        unit_price: item.unit_price,
                        usage_amount: item.usage_amount,
                        cost: item.cost,
                    })
                    .eq('id', item.id);
            }

            const totalCost = items.reduce((sum, item) => sum + (item.cost || 0), 0);

            await supabase
                .from('recipes')
                .update({
                    total_cost: totalCost,
                    manufacturing_notes: recipe.manufacturing_notes,
                    filling_quantity: recipe.filling_quantity,
                    storage_method: recipe.storage_method,
                    development_date: recipe.development_date
                })
                .eq('id', recipe.id);

            toast.success('保存しました');
            setHasChanges(false);
            setIsEditing(false);
        } catch (error) {
            toast.error('保存に失敗しました');
        }
    };

    const formatNumber = (value?: number | null, decimals = 1) => {
        if (value === undefined || value === null) return "-";
        return value.toFixed(decimals);
    };

    const formatCurrency = (value?: number | null) => {
        if (value === undefined || value === null) return "-";
        return `¥${Math.round(value).toLocaleString()}`;
    };

    const getTotals = () => {
        return {
            usage: items.reduce((sum, item) => sum + (item.usage_amount || 0), 0),
            cost: items.reduce((sum, item) => sum + (item.cost || 0), 0),
        };
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) return <div className="flex justify-center items-center h-screen text-gray-400">読み込み中...</div>;
    if (!recipe) return <div className="flex justify-center items-center h-screen text-gray-400">レシピが見つかりません</div>;

    const totals = getTotals();
    const profit = (recipe.selling_price || 0) - totals.cost;
    const profitRate = recipe.selling_price ? (profit / recipe.selling_price) * 100 : 0;

    // Group items for display
    const groupedItems = [
        { title: "原材料", items: items.filter(i => i.item_type === 'ingredient'), color: "bg-green-50 text-green-700 border-green-100" },
        { title: "中間加工品", items: items.filter(i => i.item_type === 'intermediate'), color: "bg-purple-50 text-purple-700 border-purple-100" },
        { title: "資材・包材", items: items.filter(i => i.item_type === 'material'), color: "bg-orange-50 text-orange-700 border-orange-100" },
        { title: "諸経費", items: items.filter(i => i.item_type === 'expense'), color: "bg-red-50 text-red-700 border-red-100" },
    ].filter(g => g.items.length > 0);

    return (
        <div className="min-h-screen bg-white text-gray-800 font-sans print:p-0">
            {/* Control Bar */}
            <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b px-6 py-3 flex justify-between items-center print:hidden">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.push("/recipe")} className="text-gray-500 hover:text-gray-900">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        レシピ一覧
                    </Button>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
                        <Printer className="w-4 h-4" />
                        A4印刷
                    </Button>
                    {hasChanges ? (
                        <Button size="sm" onClick={saveChanges} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                            <Save className="w-4 h-4" />
                            保存
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" onClick={() => setIsEditing(!isEditing)} className="gap-2 text-gray-600">
                            <Edit className="w-4 h-4" />
                            {isEditing ? "編集完了" : "編集"}
                        </Button>
                    )}
                </div>
            </header>

            {/* Main Content - A4 Optimized Layout */}
            <main className="max-w-[210mm] mx-auto p-8 print:p-0 print:m-0 print:w-full">
                {/* Header Section */}
                <div className="border-b-2 border-gray-800 pb-4 mb-6 flex justify-between items-end">
                    <div>
                        <div className="flex gap-2 mb-2">
                            <span className={`px-2 py-0.5 text-[10px] font-bold border rounded uppercase tracking-wider ${CATEGORIES.find(c => c.value === recipe.category)?.color || 'border-gray-200 text-gray-500'}`}>
                                {recipe.category}
                            </span>
                            {recipe.is_intermediate && (
                                <span className="px-2 py-0.5 text-[10px] font-bold border border-purple-300 text-purple-700 rounded uppercase tracking-wider">
                                    Middle
                                </span>
                            )}
                        </div>
                        <h1 className="text-3xl font-extrabold text-gray-900 leading-tight">{recipe.name}</h1>
                        <div className="flex gap-4 mt-2 text-xs text-gray-500 font-mono">
                            <span>ID: {recipe.id.split('-')[0]}</span>
                            <span>DEV: {recipe.development_date || '----/--/--'}</span>
                            <span>UPD: {new Date().toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-1">Total Cost</div>
                        <div className="text-3xl font-bold text-gray-900 tracking-tight">{formatCurrency(totals.cost)}</div>
                        <div className="text-xs text-gray-500 mt-1">
                            原価率: {recipe.selling_price && totals.cost ? ((totals.cost / recipe.selling_price) * 100).toFixed(1) : '-'}%
                        </div>
                    </div>
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-4 gap-4 mb-8">
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Selling Price</div>
                        <div className="font-bold text-lg">{formatCurrency(recipe.selling_price)}</div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Gross Profit</div>
                        <div className={`font-bold text-lg ${profit > 0 ? 'text-gray-900' : 'text-red-600'}`}>
                            {formatCurrency(profit)}
                        </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Filling (g)</div>
                        <div className="font-bold text-lg flex items-center gap-2">
                            <Input
                                type="number"
                                value={recipe.filling_quantity || ''}
                                className="h-6 w-20 px-1 py-0 text-right bg-transparent border-none focus:ring-0 p-0 shadow-none font-bold text-lg -mr-2"
                                onChange={(e) => {
                                    const val = e.target.value ? parseFloat(e.target.value) : null;
                                    handleRecipeChange('filling_quantity', val);
                                }}
                                placeholder="-"
                            />
                            <span className="text-sm font-normal text-gray-500">g</span>
                        </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Storage</div>
                        <Select value={recipe.storage_method || ''} onValueChange={(val) => handleRecipeChange('storage_method', val)}>
                            <SelectTrigger className="h-7 border-none bg-transparent p-0 focus:ring-0 shadow-none font-bold text-lg">
                                <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="常温">常温</SelectItem>
                                <SelectItem value="冷蔵">冷蔵</SelectItem>
                                <SelectItem value="冷凍">冷凍</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-12 gap-8">
                    {/* Left Column: Ingredients (8 cols) */}
                    <div className="col-span-12 md:col-span-8 print:col-span-8">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Bill of Materials</h2>
                            <span className="text-xs font-mono text-gray-400">{items.length} FILES</span>
                        </div>

                        <div className="space-y-6">
                            {groupedItems.map((group, gIdx) => (
                                <div key={gIdx} className="break-inside-avoid">
                                    <div className={`text-[10px] font-bold px-2 py-0.5 inline-block rounded mb-2 border ${group.color}`}>
                                        {group.title}
                                    </div>
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-gray-100 text-gray-400">
                                                <th className="text-left py-1 w-8 font-normal">#</th>
                                                <th className="text-left py-1 font-normal">Item Name</th>
                                                <th className="text-right py-1 w-20 font-normal">Usage</th>
                                                <th className="text-right py-1 w-20 font-normal">Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {group.items.map((item, idx) => (
                                                <tr key={item.id} className="group">
                                                    <td className="py-1.5 text-gray-300">{idx + 1}</td>
                                                    <td className="py-1.5 font-medium text-gray-700">{item.item_name}</td>
                                                    <td className="py-1.5 text-right font-mono text-gray-600">
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                className="w-12 text-right border-b border-gray-200 focus:border-blue-500 outline-none bg-transparent"
                                                                value={item.usage_amount || ''}
                                                                onChange={(e) => handleItemChange(item.id, 'usage_amount', e.target.value)}
                                                            />
                                                        ) : (
                                                            formatNumber(item.usage_amount, 1)
                                                        )}
                                                    </td>
                                                    <td className="py-1.5 text-right font-mono font-medium text-gray-900 group-hover:bg-gray-50 rounded-r">
                                                        {formatCurrency(item.cost)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {/* Group Subtotal */}
                                        <tfoot className="border-t border-gray-100">
                                            <tr>
                                                <td colSpan={3} className="py-2 text-right text-[10px] text-gray-400 uppercase tracking-wider">Subtotal</td>
                                                <td className="py-2 text-right font-mono font-bold text-gray-700">
                                                    {formatCurrency(group.items.reduce((sum, i) => sum + (i.cost || 0), 0))}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Column: Notes & Nutrition (4 cols) */}
                    <div className="col-span-12 md:col-span-4 print:col-span-4 flex flex-col gap-8">
                        {/* Manufacturing Notes */}
                        <div className="break-inside-avoid bg-gray-50 p-4 rounded border border-gray-100 print:bg-white print:border-l-2 print:border-gray-200 print:border-t-0 print:border-r-0 print:border-b-0 print:rounded-none">
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Edit className="w-3 h-3" />
                                Manufacturing Notes
                            </h3>
                            <textarea
                                className="w-full min-h-[200px] text-xs leading-relaxed bg-transparent border-none resize-none p-0 focus:ring-0 text-gray-700 placeholder:text-gray-300"
                                value={recipe.manufacturing_notes || ''}
                                onChange={(e) => setRecipe({ ...recipe, manufacturing_notes: e.target.value })}
                                onBlur={(e) => handleRecipeChange('manufacturing_notes', e.target.value)}
                                placeholder="製造プロセスや注意点を記載..."
                            />
                        </div>

                        {/* Nutrition */}
                        <div className="break-inside-avoid">
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 border-b pb-1">Nutrition (per 100g)</h3>
                            <NutritionDisplay items={items.map(item => ({
                                item_name: item.item_name,
                                item_type: item.item_type,
                                usage_amount: item.usage_amount,
                                nutrition: nutritionMap[item.item_name]
                            }))} compact={true} />
                        </div>
                    </div>
                </div>
            </main>

            <style jsx global>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 10mm;
                    }
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        background: white;
                    }
                    /* Ensure grid columns maintain layout in print */
                    .md\\:col-span-8 {
                        grid-column: span 8 / span 12 !important;
                    }
                    .md\\:col-span-4 {
                        grid-column: span 4 / span 12 !important;
                    }
                }
            `}</style>
        </div>
    );
}
