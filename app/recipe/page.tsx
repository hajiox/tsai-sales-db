// app/recipe/page.tsx
// レシピシステム メインページ（改訂版）

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { Search, FileSpreadsheet, ChefHat, Package, Building, Truck, Globe, ShoppingBag, Plus } from "lucide-react";
import { toast } from "sonner";

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

type TabType = "all" | "ネット専用" | "自社" | "OEM" | "Shopee" | "中間部品";

export default function RecipePage() {
    const router = useRouter();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<TabType>("all");
    const [stats, setStats] = useState({
        total: 0,
        ネット専用: 0,
        自社: 0,
        OEM: 0,
        Shopee: 0,
        中間部品: 0,
        ingredients: 0,
        materials: 0,
    });
    const [usageMap, setUsageMap] = useState<Record<string, string[]>>({});

    useEffect(() => {
        if (activeTab === "中間部品") {
            fetchIntermediateUsage();
        }
    }, [activeTab, recipes]);

    const fetchIntermediateUsage = async () => {
        // Fetch ALL items to ensure we catch fuzzy matches
        // Optimization: We could filter but for correctness vs fuzzy, fetching all is safer
        const { data: allItems, error } = await supabase
            .from('recipe_items')
            .select('item_name, recipe_id, recipes!inner(name)');

        if (error || !allItems) {
            console.error("Error fetching usage items:", error);
            return;
        }

        const intermediates = recipes.filter(r => r.is_intermediate);
        const map: Record<string, string[]> = {};

        const normalize = (s: string) => s.replace(/【.*?】|\[.*?\]/g, '').replace(/\s+/g, '').trim();
        const stripParens = (s: string) => s.replace(/[（()）]/g, '');
        const stripNo = (s: string) => s.replace(/の/g, '');

        intermediates.forEach(inter => {
            const interName = inter.name;
            const normInter = normalize(interName);
            const interNoParens = stripParens(normInter);
            const interNoNo = stripNo(interNoParens);

            // Find matching items
            const matches = allItems.filter(item => {
                const iName = item.item_name;
                const normItem = normalize(iName);

                // 1. Exact match (normalized)
                if (normItem === normInter) return true;

                // 2. Parens agnostic (e.g. "Foo(Bar)" vs "FooBar")
                const itemNoParens = stripParens(normItem);
                if (itemNoParens === interNoParens) return true;

                // 3. 'No' agnostic (e.g. "FooNoBar" vs "FooBar")
                const itemNoNo = stripNo(itemNoParens);
                if (itemNoNo === interNoNo && itemNoNo.length > 2) return true;

                return false;
            });

            matches.forEach(m => {
                const parentName = (m.recipes as any)?.name;
                if (parentName) {
                    if (!map[interName]) map[interName] = [];
                    if (!map[interName].includes(parentName)) map[interName].push(parentName);
                }
            });
        });

        setUsageMap(map);
    };

    useEffect(() => {
        fetchRecipes();
        fetchStats();
    }, []);

    const fetchRecipes = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("recipes")
            .select("*")
            .order("name");

        if (!error && data) {
            setRecipes(data);
        }
        setLoading(false);
    };

    // カテゴリー変更
    const handleCategoryChange = async (recipeId: string, newCategory: string) => {
        try {
            const { error } = await supabase
                .from('recipes')
                .update({ category: newCategory })
                .eq('id', recipeId);

            if (error) throw error;

            // ローカルステートを更新
            setRecipes(prev => prev.map(r =>
                r.id === recipeId ? { ...r, category: newCategory } : r
            ));
            toast.success(`カテゴリーを「${newCategory}」に変更しました`);
            fetchStats(); // 統計を更新
        } catch (error) {
            toast.error('カテゴリー変更に失敗しました');
        }
    };

    // 開発日変更
    const handleDateChange = async (recipeId: string, newDate: string) => {
        try {
            const { error } = await supabase
                .from('recipes')
                .update({ development_date: newDate || null })
                .eq('id', recipeId);

            if (error) throw error;

            // ローカルステートを更新
            setRecipes(prev => prev.map(r =>
                r.id === recipeId ? { ...r, development_date: newDate || null } : r
            ));
            toast.success('開発日を更新しました');
        } catch (error) {
            toast.error('開発日の更新に失敗しました');
        }
    };

    const fetchStats = async () => {
        // レシピ総数
        const { count: recipeCount } = await supabase
            .from("recipes")
            .select("*", { count: "exact", head: true });

        // カテゴリ別カウント
        const categories: TabType[] = ["ネット専用", "自社", "OEM", "Shopee"];
        const categoryCounts: Record<string, number> = {};

        for (const cat of categories) {
            const { count } = await supabase
                .from("recipes")
                .select("*", { count: "exact", head: true })
                .eq("category", cat)
                .eq("is_intermediate", false);
            categoryCounts[cat] = count || 0;
        }

        // 中間部品カウント
        const { count: intermediateCount } = await supabase
            .from("recipes")
            .select("*", { count: "exact", head: true })
            .eq("is_intermediate", true);

        // 食材・資材カウント
        const { count: ingredientCount } = await supabase
            .from("ingredients")
            .select("*", { count: "exact", head: true });

        const { count: materialCount } = await supabase
            .from("materials")
            .select("*", { count: "exact", head: true });

        setStats({
            total: recipeCount || 0,
            ネット専用: categoryCounts["ネット専用"] || 0,
            自社: categoryCounts["自社"] || 0,
            OEM: categoryCounts["OEM"] || 0,
            Shopee: categoryCounts["Shopee"] || 0,
            中間部品: intermediateCount || 0,
            ingredients: ingredientCount || 0,
            materials: materialCount || 0,
        });
    };

    // タブとフィルタ
    const filteredRecipes = recipes.filter((r) => {
        const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase());

        if (activeTab === "all") return matchesSearch;
        if (activeTab === "中間部品") return r.is_intermediate && matchesSearch;
        return r.category === activeTab && !r.is_intermediate && matchesSearch;
    });

    const formatCurrency = (value: number | null) => {
        if (!value) return "-";
        return `¥${value.toLocaleString()}`;
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "-";
        return dateStr;
    };

    const tabs = [
        { key: "all" as TabType, label: "全て", icon: ChefHat, count: stats.total },
        { key: "ネット専用" as TabType, label: "ネット専用", icon: Globe, count: stats.ネット専用 },
        { key: "自社" as TabType, label: "自社", icon: Building, count: stats.自社 },
        { key: "OEM" as TabType, label: "OEM", icon: Truck, count: stats.OEM },
        { key: "Shopee" as TabType, label: "Shopee", icon: ShoppingBag, count: stats.Shopee },
        { key: "中間部品" as TabType, label: "中間部品【P】", icon: Package, count: stats.中間部品 },
    ];

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                    <ChefHat className="w-8 h-8" />
                    レシピ管理システム
                </h1>
                <p className="text-gray-600 mt-1">製造レシピの一元管理・原価計算</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">
                            総レシピ数
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-blue-500" />
                            <span className="text-2xl font-bold">{stats.total}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">
                            食材マスター
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <Package className="w-5 h-5 text-green-500" />
                            <span className="text-2xl font-bold">{stats.ingredients}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">
                            資材マスター
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <Package className="w-5 h-5 text-orange-500" />
                            <span className="text-2xl font-bold">{stats.materials}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">
                            中間部品【P】
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <Package className="w-5 h-5 text-purple-500" />
                            <span className="text-2xl font-bold">{stats.中間部品}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Category Tabs */}
            <div className="flex border-b border-gray-300 mb-4 overflow-x-auto">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-t border-l border-r rounded-t-lg -mb-px whitespace-nowrap transition ${activeTab === tab.key
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
            <div className="bg-white rounded-lg shadow p-4 mb-6 border-t-0 rounded-t-none">
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                                placeholder="レシピを検索..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </div>

                    <Button variant="outline" onClick={() => router.push("/recipe/database")}>
                        <Package className="w-4 h-4 mr-2" />
                        材料データベース
                    </Button>

                    <Button variant="outline" onClick={() => router.push("/recipe/import")}>
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Excelインポート
                    </Button>

                    <Button onClick={() => router.push("/recipe/new")}>
                        <Plus className="w-4 h-4 mr-2" />
                        新規作成
                    </Button>
                </div>
            </div>

            {/* Recipe Table */}
            <div className="bg-white rounded-lg shadow">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>商品名</TableHead>
                            {activeTab === "中間部品" && <TableHead>使用されている商品</TableHead>}
                            <TableHead>カテゴリ</TableHead>
                            <TableHead>開発日</TableHead>
                            <TableHead className="text-right">販売価格</TableHead>
                            <TableHead>ソースファイル</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8">
                                    読み込み中...
                                </TableCell>
                            </TableRow>
                        ) : filteredRecipes.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                                    レシピがありません
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredRecipes.map((recipe) => (
                                <TableRow
                                    key={recipe.id}
                                    className="cursor-pointer hover:bg-gray-50"
                                    onClick={() => router.push(`/recipe/${recipe.id}`)}
                                >
                                    <TableCell className="font-medium">
                                        {recipe.is_intermediate && (
                                            <span className="mr-2 px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                                                P
                                            </span>
                                        )}
                                        {recipe.name}
                                    </TableCell>
                                    {activeTab === "中間部品" && (
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {usageMap[recipe.name]?.map((parent, i) => (
                                                    <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs border border-gray-200">
                                                        {parent}
                                                    </span>
                                                )) || <span className="text-gray-400 text-xs">-</span>}
                                            </div>
                                        </TableCell>
                                    )}
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <Select
                                            value={recipe.category}
                                            onValueChange={(val) => handleCategoryChange(recipe.id, val)}
                                        >
                                            <SelectTrigger className="w-[110px] h-7">
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
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <Input
                                            type="date"
                                            value={recipe.development_date || ''}
                                            onChange={(e) => handleDateChange(recipe.id, e.target.value)}
                                            className="w-[130px] h-7 text-sm"
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatCurrency(recipe.selling_price)}
                                    </TableCell>
                                    <TableCell className="text-xs text-gray-500 max-w-[200px] truncate">
                                        {recipe.source_file?.replace("【重要】【製造】総合管理（新型）", "").replace(".xlsx", "") || "-"}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
