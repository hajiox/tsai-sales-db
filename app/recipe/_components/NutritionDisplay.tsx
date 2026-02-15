// app/recipe/_components/NutritionDisplay.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

export interface NutritionData {
    calories: number | null;
    protein: number | null;
    fat: number | null;
    carbohydrate: number | null;
    sodium: number | null;
}

export interface ItemWithNutrition {
    item_name: string;
    item_type: string;
    usage_amount: number | null;
    nutrition?: NutritionData; // マスターデータから取得した栄養成分（100gあたり）
}

interface NutritionDisplayProps {
    items: ItemWithNutrition[];
    compact?: boolean;
    fillingQuantity?: number | null;
}

export default function NutritionDisplay({ items, compact = false, fillingQuantity }: NutritionDisplayProps) {
    if (!items || items.length === 0) return null;

    // 食材(ingredient)のみ対象にする（中間部品はデータがないため一旦除外、将来的に対応必要）
    const targetItems = items.filter(i =>
        i.item_type === 'ingredient' && i.nutrition && i.usage_amount && i.usage_amount > 0
    );

    if (targetItems.length === 0) return null;

    // 全体の重量（栄養成分不明なものも含める）
    const totalRecipeWeight = items.reduce((sum, item) => {
        if (item.item_type === 'material' || item.item_type === 'expense') return sum;
        return sum + (item.usage_amount || 0);
    }, 0);

    // 栄養成分合計 (1食あたり)
    const totalNutrition = targetItems.reduce((acc, item) => {
        const amount = item.usage_amount || 0;
        // 栄養成分は100gあたりの値
        if (!item.nutrition) return acc;

        return {
            calories: acc.calories + (item.nutrition.calories || 0) * amount / 100,
            protein: acc.protein + (item.nutrition.protein || 0) * amount / 100,
            fat: acc.fat + (item.nutrition.fat || 0) * amount / 100,
            carbohydrate: acc.carbohydrate + (item.nutrition.carbohydrate || 0) * amount / 100,
            sodium: acc.sodium + (item.nutrition.sodium || 0) * amount / 100,
        };
    }, { calories: 0, protein: 0, fat: 0, carbohydrate: 0, sodium: 0 });

    const formatVal = (val: number) => val.toLocaleString(undefined, { maximumFractionDigits: 1 });

    const per100g = {
        calories: totalRecipeWeight ? totalNutrition.calories / totalRecipeWeight * 100 : 0,
        protein: totalRecipeWeight ? totalNutrition.protein / totalRecipeWeight * 100 : 0,
        fat: totalRecipeWeight ? totalNutrition.fat / totalRecipeWeight * 100 : 0,
        carbohydrate: totalRecipeWeight ? totalNutrition.carbohydrate / totalRecipeWeight * 100 : 0,
        sodium: totalRecipeWeight ? totalNutrition.sodium / totalRecipeWeight * 100 : 0,
    };

    if (compact) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-600">
                    <div className="flex justify-between border-b pb-1">
                        <span>エネルギー</span>
                        <span className="font-bold">{formatVal(per100g.calories)} kcal</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                        <span>タンパク質</span>
                        <span className="font-bold">{formatVal(per100g.protein)} g</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                        <span>脂質</span>
                        <span className="font-bold">{formatVal(per100g.fat)} g</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                        <span>炭水化物</span>
                        <span className="font-bold">{formatVal(per100g.carbohydrate)} g</span>
                    </div>
                    <div className="flex justify-between border-b pb-1 col-span-2">
                        <span>食塩相当量</span>
                        <span className="font-bold">{formatVal(per100g.sodium)} g</span>
                    </div>
                </div>

                {fillingQuantity && fillingQuantity > 0 && (
                    <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                            1個 ({formatVal(fillingQuantity)}g) あたり
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-600">
                            <div className="flex justify-between border-b pb-1">
                                <span>エネルギー</span>
                                <span className="font-bold">{formatVal(per100g.calories * fillingQuantity / 100)} kcal</span>
                            </div>
                            <div className="flex justify-between border-b pb-1">
                                <span>タンパク質</span>
                                <span className="font-bold">{formatVal(per100g.protein * fillingQuantity / 100)} g</span>
                            </div>
                            <div className="flex justify-between border-b pb-1">
                                <span>脂質</span>
                                <span className="font-bold">{formatVal(per100g.fat * fillingQuantity / 100)} g</span>
                            </div>
                            <div className="flex justify-between border-b pb-1">
                                <span>炭水化物</span>
                                <span className="font-bold">{formatVal(per100g.carbohydrate * fillingQuantity / 100)} g</span>
                            </div>
                            <div className="flex justify-between border-b pb-1 col-span-2">
                                <span>食塩相当量</span>
                                <span className="font-bold">{formatVal(per100g.sodium * fillingQuantity / 100)} g</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // 中間部品が含まれているかチェック
    const hasIntermediate = items.some(i => i.item_type === 'intermediate');

    return (
        <Card className="mt-6 border-blue-100 shadow-sm">
            <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-white">
                <CardTitle className="text-lg flex items-center gap-2 text-blue-800">
                    <Activity className="w-5 h-5" />
                    栄養成分表示（推定値）
                </CardTitle>
                <p className="text-xs text-slate-500 font-normal mt-1">
                    ※登録されている食材データの100gあたり成分から算出しています。
                    {hasIntermediate && <span className="text-orange-500 block font-bold">※中間部品の栄養成分は含まれていません。</span>}
                </p>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* 100gあたり (重要) */}
                    <div className="bg-slate-50 p-4 rounded-lg">
                        <h4 className="text-sm font-bold text-slate-700 mb-3 border-b border-slate-200 pb-2">
                            100g あたり
                        </h4>
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between items-center">
                                <dt className="text-slate-600">エネルギー</dt>
                                <dd className="font-bold text-slate-900 text-lg">{formatVal(per100g.calories)} <span className="text-xs font-normal text-slate-500">kcal</span></dd>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                                <dt className="text-slate-600">タンパク質</dt>
                                <dd className="font-medium text-slate-900">{formatVal(per100g.protein)} <span className="text-xs font-normal text-slate-500">g</span></dd>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                                <dt className="text-slate-600">脂質</dt>
                                <dd className="font-medium text-slate-900">{formatVal(per100g.fat)} <span className="text-xs font-normal text-slate-500">g</span></dd>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                                <dt className="text-slate-600">炭水化物</dt>
                                <dd className="font-medium text-slate-900">{formatVal(per100g.carbohydrate)} <span className="text-xs font-normal text-slate-500">g</span></dd>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                                <dt className="text-slate-600">食塩相当量</dt>
                                <dd className="font-medium text-slate-900">{formatVal(per100g.sodium)} <span className="text-xs font-normal text-slate-500">g</span></dd>
                            </div>
                        </dl>
                    </div>

                    {/* 1食あたり */}
                    <div className="bg-white border p-4 rounded-lg">
                        <h4 className="text-sm font-bold text-slate-700 mb-3 border-b border-slate-200 pb-2 flex justify-between">
                            <span>1食あたり</span>
                            <span className="text-xs font-normal text-slate-500">総重量: 約{formatVal(totalRecipeWeight)}g</span>
                        </h4>
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between items-center">
                                <dt className="text-slate-600">エネルギー</dt>
                                <dd className="font-bold text-slate-900">{formatVal(totalNutrition.calories)} <span className="text-xs font-normal text-slate-500">kcal</span></dd>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                                <dt className="text-slate-600">タンパク質</dt>
                                <dd className="font-medium text-slate-900">{formatVal(totalNutrition.protein)} <span className="text-xs font-normal text-slate-500">g</span></dd>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                                <dt className="text-slate-600">脂質</dt>
                                <dd className="font-medium text-slate-900">{formatVal(totalNutrition.fat)} <span className="text-xs font-normal text-slate-500">g</span></dd>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                                <dt className="text-slate-600">炭水化物</dt>
                                <dd className="font-medium text-slate-900">{formatVal(totalNutrition.carbohydrate)} <span className="text-xs font-normal text-slate-500">g</span></dd>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                                <dt className="text-slate-600">食塩相当量</dt>
                                <dd className="font-medium text-slate-900">{formatVal(totalNutrition.sodium)} <span className="text-xs font-normal text-slate-500">g</span></dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
