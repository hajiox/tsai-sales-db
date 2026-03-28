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
import { Search, FileSpreadsheet, FileText, ChefHat, Package, Building, Truck, Globe, ShoppingBag, Plus, Link as LinkIcon, Link2, Edit, Copy, Trash2, Bell } from "lucide-react";
import { toast } from "sonner";
import { fetchSeriesList, SERIES_LIST, type SeriesItem } from "@/lib/series-list";

// カテゴリー一覧
const CATEGORIES = [
    { value: "ネット専用", label: "ネット専用", color: "bg-blue-100 text-blue-800" },
    { value: "自社", label: "自社", color: "bg-green-100 text-green-800" },
    { value: "OEM", label: "OEM", color: "bg-orange-100 text-orange-800" },
    { value: "中間部品", label: "中間部品", color: "bg-purple-100 text-purple-800" },
    { value: "終売", label: "終売", color: "bg-gray-500 text-white" },
    { value: "試作", label: "試作", color: "bg-gray-100 text-gray-800" },
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
    linked_product_id: string | null;
    linked_wholesale_product_id: string | null;
    linked_oem_product_id: string | null;
    series: string | null;
    series_code: number | null;
    product_code: number | null;
}

type TabType = "all" | "ネット専用" | "自社" | "OEM" | "中間部品" | "試作" | "終売";

export default function RecipePage() {
    const router = useRouter();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<TabType>("ネット専用");
    const [seriesList, setSeriesList] = useState<SeriesItem[]>(SERIES_LIST);
    const [pendingEstimateCount, setPendingEstimateCount] = useState(0);
    const [pendingEstimateGroups, setPendingEstimateGroups] = useState(0);
    const [stats, setStats] = useState({
        total: 0,
        ネット専用: 0,
        自社: 0,
        OEM: 0,
        試作: 0,
        中間部品: 0,
        終売: 0,
        ingredients: 0,
        materials: 0,
    });
    const [usageMap, setUsageMap] = useState<Record<string, string[]>>({});
    const [linkedProductNames, setLinkedProductNames] = useState<Record<string, string>>({});

    // 紐づけ先商品名を取得
    useEffect(() => {
        const fetchLinkedProductNames = async () => {
            const linkedRecipes = recipes.filter(r => r.linked_product_id);
            if (linkedRecipes.length === 0) {
                setLinkedProductNames({});
                return;
            }
            const productIds = linkedRecipes.map(r => r.linked_product_id!).filter((v, i, a) => a.indexOf(v) === i);
            const { data, error } = await supabase
                .from('products')
                .select('id, name')
                .in('id', productIds);
            if (!error && data) {
                const nameMap: Record<string, string> = {};
                data.forEach((p: { id: string; name: string }) => {
                    nameMap[p.id] = p.name;
                });
                setLinkedProductNames(nameMap);
            }
        };
        fetchLinkedProductNames();
    }, [recipes]);

    useEffect(() => {
        if (activeTab === "中間部品") {
            fetchIntermediateUsage();
        }
    }, [activeTab, recipes]);

    useEffect(() => {
        fetchSeriesList().then(setSeriesList);
    }, []);

    const fetchIntermediateUsage = async () => {
        try {
            const res = await fetch("/api/recipe/intermediate-usage");
            if (!res.ok) throw new Error("API error");
            const data = await res.json();
            setUsageMap(data.usageMap || {});
        } catch (err) {
            console.error("Error in fetchIntermediateUsage:", err);
        }
    };

    useEffect(() => {
        fetchRecipes();
        fetchStats();
        // 見積書pending件数を取得
        fetch('/api/recipe/estimates?status=pending')
            .then(r => r.json())
            .then(d => {
                setPendingEstimateCount(d.pendingCount || 0);
                // グループ数（見積書の社数）を算出
                const items = d.items || [];
                const docIds = new Set(items.map((i: any) => i.doc_scanner_doc_id));
                setPendingEstimateGroups(docIds.size);
            })
            .catch(() => { });
    }, []);

    const fetchRecipes = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("recipes")
            .select("*")
            .order("series", { ascending: true, nullsFirst: false })
            .order("series_code", { ascending: true, nullsFirst: false })
            .order("product_code", { ascending: true, nullsFirst: false })
            .order("name");

        if (!error && data) {
            setRecipes(data);
        }
        setLoading(false);
    };

    // 汎用レシピ更新ヘルパー（API経由でRLSバイパス）
    const updateRecipe = async (recipeId: string, updates: Record<string, any>): Promise<boolean> => {
        try {
            const res = await fetch('/api/recipe/update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipeId, updates }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '更新に失敗しました');
            }
            return true;
        } catch (error: any) {
            toast.error(error.message || '更新に失敗しました');
            return false;
        }
    };

    // カテゴリー変更
    const handleCategoryChange = async (recipeId: string, newCategory: string) => {
        const isIntermediate = newCategory === '中間部品';
        const ok = await updateRecipe(recipeId, { category: newCategory });
        if (ok) {
            setRecipes(prev => prev.map(r =>
                r.id === recipeId ? { ...r, category: newCategory, is_intermediate: isIntermediate } : r
            ));
            toast.success(`カテゴリーを「${newCategory}」に変更しました`);
            fetchStats();
        }
    };

    // 開発日変更
    const handleDateChange = async (recipeId: string, newDate: string) => {
        const ok = await updateRecipe(recipeId, { development_date: newDate || null });
        if (ok) {
            setRecipes(prev => prev.map(r =>
                r.id === recipeId ? { ...r, development_date: newDate || null } : r
            ));
            toast.success('開発日を更新しました');
        }
    };

    const fetchStats = async () => {
        const categories = ["ネット専用", "自社", "OEM", "試作", "Shopee", "終売", "中間部品"];

        // 全10クエリを並列実行（直列比 約10倍高速化）
        const [totalRes, ingRes, matRes, ...catResults] = await Promise.all([
            supabase.from("recipes").select("*", { count: "exact", head: true }),
            supabase.from("ingredients").select("*", { count: "exact", head: true }),
            supabase.from("materials").select("*", { count: "exact", head: true }),
            ...categories.map(cat =>
                supabase.from("recipes").select("*", { count: "exact", head: true }).eq("category", cat)
            ),
        ]);

        const categoryCounts: Record<string, number> = {};
        categories.forEach((cat, i) => {
            categoryCounts[cat] = catResults[i].count || 0;
        });

        setStats({
            total: totalRes.count || 0,
            ネット専用: categoryCounts["ネット専用"] || 0,
            自社: categoryCounts["自社"] || 0,
            OEM: categoryCounts["OEM"] || 0,
            試作: categoryCounts["試作"] || 0,
            中間部品: categoryCounts["中間部品"] || 0,
            終売: categoryCounts["終売"] || 0,
            ingredients: ingRes.count || 0,
            materials: matRes.count || 0,
        });
    };

    // タブとフィルタ
    const filteredRecipes = recipes.filter((r) => {
        const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase());
        if (activeTab === "all") return matchesSearch;
        return r.category === activeTab && matchesSearch;
    }).sort((a, b) => {
        // シリーズコード → 商品番号 → 名前の順でソート
        const scA = a.series_code ?? 9999;
        const scB = b.series_code ?? 9999;
        if (scA !== scB) return scA - scB;
        const pcA = a.product_code ?? 9999;
        const pcB = b.product_code ?? 9999;
        if (pcA !== pcB) return pcA - pcB;
        return a.name.localeCompare(b.name, 'ja');
    });

    // 削除ハンドラ（独立関数としてStale Closure回避）
    const handleDeleteRecipe = async (recipeId: string, recipeName: string) => {
        if (!window.confirm(`本当に「${recipeName}」を削除しますか？\nこの操作は取り消せません。`)) return;
        try {
            const res = await fetch('/api/recipe/duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_one', recipeId }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '削除に失敗しました');
            }
            setRecipes(prev => prev.filter(r => r.id !== recipeId));
            toast.success('レシピを削除しました');
            fetchStats();
        } catch (error: any) {
            toast.error(error.message || '削除に失敗しました');
        }
    };

    // 名称変更ハンドラ
    const handleRenameRecipe = async (recipeId: string, currentName: string) => {
        const newName = window.prompt('新しいレシピ名を入力してください', currentName);
        if (newName && newName !== currentName) {
            if (window.confirm(`「${currentName}」を「${newName}」に変更しますか？`)) {
                const ok = await updateRecipe(recipeId, { name: newName });
                if (ok) {
                    setRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, name: newName } : r));
                    toast.success('名称を変更しました');
                }
            }
        }
    };

    // 複製ハンドラ
    const handleDuplicateRecipe = async (recipe: Recipe) => {
        if (!window.confirm(`「${recipe.name}」を複製しますか？`)) return;
        try {
            const res = await fetch('/api/recipe/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipeId: recipe.id }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '複製に失敗しました');
            }
            const { newRecipeId } = await res.json();
            const copiedRecipe: Recipe = {
                ...recipe,
                id: newRecipeId,
                name: `${recipe.name} (コピー)`,
                linked_product_id: null,
            };
            setRecipes(prev => [...prev, copiedRecipe]);
            toast.success('レシピを複製しました');
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || '複製に失敗しました');
        }
    };

    // シリーズ変更
    const handleSeriesChange = async (recipeId: string, seriesCode: number | null, seriesName: string | null) => {
        const ok = await updateRecipe(recipeId, { series_code: seriesCode, series: seriesName });
        if (ok) {
            setRecipes(prev => prev.map(r =>
                r.id === recipeId ? { ...r, series_code: seriesCode, series: seriesName } : r
            ));
            toast.success('シリーズを更新しました');
        }
    };

    const handleProductCodeChange = async (recipeId: string, productCode: number | null) => {
        const ok = await updateRecipe(recipeId, { product_code: productCode });
        if (ok) {
            setRecipes(prev => prev.map(r =>
                r.id === recipeId ? { ...r, product_code: productCode } : r
            ));
        }
    };

    // シリーズ一覧は共通ファイルから取得

    const formatCurrency = (value: number | null) => {
        if (!value) return "-";
        return `¥${value.toLocaleString()}`;
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "-";
        return dateStr;
    };

    const tabs = [
        { key: "ネット専用" as TabType, label: "ネット専用", icon: ShoppingBag, count: stats.ネット専用 },
        { key: "自社" as TabType, label: "自社", icon: Building, count: stats.自社 },
        { key: "OEM" as TabType, label: "OEM", icon: Truck, count: stats.OEM },
        { key: "試作" as TabType, label: "試作", icon: ChefHat, count: stats.試作 },
        { key: "中間部品" as TabType, label: "中間部品【P】", icon: Package, count: stats.中間部品 },
        { key: "終売" as TabType, label: "終売", icon: FileSpreadsheet, count: stats.終売 },
        { key: "all" as TabType, label: "全て", icon: FileSpreadsheet, count: stats.total },
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

            {/* 見積書データ待機アラート */}
            {pendingEstimateCount > 0 && (
                <div
                    onClick={() => router.push('/recipe/estimates')}
                    className="mb-6 flex items-center gap-3 px-5 py-3 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 transition shadow-sm"
                >
                    <div className="flex items-center justify-center w-8 h-8 bg-amber-400 rounded-full text-white">
                        <Bell className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                        <span className="font-semibold text-amber-900">📋 見積書 {pendingEstimateGroups}社 {pendingEstimateCount}項目 待機中</span>
                        <span className="text-amber-700 text-sm ml-2">Doc Scannerから受信した見積書の明細を確認してください</span>
                    </div>
                    <span className="text-amber-500 text-sm">確認する →</span>
                </div>
            )}

            {/* Stats Cards - Updated to single row layout */}
            <div className="flex flex-wrap gap-4 mb-6">
                <Card className="min-w-[140px] flex-1">
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

                <Card className="min-w-[140px] flex-1">
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

                <Card className="min-w-[140px] flex-1">
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

                <Card className="min-w-[140px] flex-1">
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

                <Card className="min-w-[140px] flex-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">
                            試作
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <ChefHat className="w-5 h-5 text-gray-500" />
                            <span className="text-2xl font-bold">{stats.試作}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="min-w-[140px] flex-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">
                            終売
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-gray-400" />
                            <span className="text-2xl font-bold">{stats.終売}</span>
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

                    <Button variant="outline" onClick={() => router.push("/recipe/product-link")} className="border-blue-300 text-blue-700 hover:bg-blue-50">
                        <LinkIcon className="w-4 h-4 mr-2" />
                        WEB販売紐付け
                    </Button>

                    <Button variant="outline" onClick={() => router.push("/recipe/wholesale-link")} className="border-green-300 text-green-700 hover:bg-green-50">
                        <LinkIcon className="w-4 h-4 mr-2" />
                        卸販売紐付け
                    </Button>

                    <Button variant="outline" onClick={() => router.push("/recipe/oem-link")} className="border-purple-300 text-purple-700 hover:bg-purple-50">
                        <LinkIcon className="w-4 h-4 mr-2" />
                        OEM紐付け
                    </Button>

                    <Button variant="outline" onClick={() => router.push("/recipe/database")}>
                        <Package className="w-4 h-4 mr-2" />
                        材料データベース
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => router.push('/recipe/estimates')}
                        className={pendingEstimateCount > 0 ? 'border-amber-400 text-amber-700 hover:bg-amber-50 relative' : ''}
                    >
                        <FileText className="w-4 h-4 mr-2" />
                        見積書データ
                        {pendingEstimateCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                {pendingEstimateCount}
                            </span>
                        )}
                    </Button>

                    <Button variant="outline" onClick={() => router.push("/recipe/series")}>
                        <Edit className="w-4 h-4 mr-2" />
                        シリーズ管理
                    </Button>

                    <Button onClick={() => router.push("/recipe/new")}>
                        <Plus className="w-4 h-4 mr-2" />
                        新規作成
                    </Button>
                </div>
            </div>

            {/* Recipe Table */}
            <div className="bg-white rounded-lg shadow">
                <div className="flex items-center gap-4 px-4 py-2 border-b text-[10px] text-gray-400">
                    <span>利益率:</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />30%以上</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />20%以上</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />20%未満</span>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[140px]">シリーズ</TableHead>
                            <TableHead className="w-[50px] text-center">No.</TableHead>
                            <TableHead>商品名</TableHead>
                            {activeTab === "中間部品" && <TableHead>使用されている商品</TableHead>}
                            <TableHead>カテゴリ</TableHead>
                            {activeTab !== "中間部品" && <TableHead className="text-right">販売価格</TableHead>}
                            <TableHead className="text-right">原価</TableHead>
                            {activeTab !== "中間部品" && <TableHead className="text-right w-[80px]">{activeTab === "自社" ? "利益率（７掛）" : "利益率"}</TableHead>}
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
                                    <TableCell onClick={(e) => e.stopPropagation()} className="text-xs">
                                        <Select
                                            value={recipe.series_code != null ? String(recipe.series_code) : "__none__"}
                                            onValueChange={(val) => {
                                                if (val === "__none__") {
                                                    handleSeriesChange(recipe.id, null, null);
                                                } else {
                                                    const s = seriesList.find(s => s.code === Number(val));
                                                    handleSeriesChange(recipe.id, Number(val), s?.name || null);
                                                }
                                            }}
                                        >
                                            <SelectTrigger className="h-7 w-[130px] text-xs">
                                                <SelectValue>
                                                    {recipe.series || '—'}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">
                                                    <span className="text-gray-400">— なし —</span>
                                                </SelectItem>
                                                {seriesList.map(s => (
                                                    <SelectItem key={s.code} value={String(s.code)}>
                                                        {s.code}. {s.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()} className="text-center">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            defaultValue={recipe.product_code ?? ''}
                                            onBlur={(e) => {
                                                const raw = e.target.value.replace(/[^0-9]/g, '');
                                                const val = raw ? Number(raw) : null;
                                                if (val !== recipe.product_code) {
                                                    handleProductCodeChange(recipe.id, val);
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    (e.target as HTMLInputElement).blur();
                                                }
                                            }}
                                            className="w-[50px] h-7 text-xs text-center p-1 border rounded-md border-input bg-background"
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-1">
                                            {recipe.is_intermediate && (
                                                <span className="mr-1 px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                                                    P
                                                </span>
                                            )}
                                            <span className="flex-1">{recipe.name}</span>
                                            {recipe.linked_product_id && (
                                                <span
                                                    className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium cursor-help"
                                                    title={`WEB販売紐付済: ${linkedProductNames[recipe.linked_product_id] || '取得中...'}`}
                                                >
                                                    <Link2 className="h-3 w-3" />WEB
                                                </span>
                                            )}
                                            {recipe.linked_wholesale_product_id && (
                                                <span
                                                    className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium cursor-help"
                                                    title="卸販売紐付済"
                                                >
                                                    <Link2 className="h-3 w-3" />卸
                                                </span>
                                            )}
                                            {recipe.linked_oem_product_id && (
                                                <span
                                                    className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-medium cursor-help"
                                                    title="OEM紐付済"
                                                >
                                                    <Link2 className="h-3 w-3" />OEM
                                                </span>
                                            )}
                                        </div>
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
                                    {activeTab !== "中間部品" && (
                                    <TableCell className="text-right">
                                        {formatCurrency(recipe.selling_price)}
                                    </TableCell>
                                    )}
                                    <TableCell className="text-right text-xs text-gray-500">
                                        {recipe.total_cost ? formatCurrency(Math.round(recipe.total_cost)) : <span className="text-gray-300">-</span>}
                                    </TableCell>
                                    {activeTab !== "中間部品" && (
                                    <TableCell className="text-right">
                                        {(() => {
                                            if (!recipe.selling_price || !recipe.total_cost) return <span className="text-gray-300">-</span>;
                                            if (activeTab === "自社") {
                                                const wholesalePrice = Math.round(recipe.selling_price * 0.7);
                                                const wholesaleProfit = wholesalePrice - recipe.total_cost;
                                                const rate = wholesalePrice > 0 ? (wholesaleProfit / wholesalePrice) * 100 : 0;
                                                const color = rate >= 30 ? "text-green-600" : rate >= 20 ? "text-blue-600" : "text-red-600";
                                                return <span className={`text-sm font-bold ${color}`}>{rate.toFixed(1)}%</span>;
                                            } else {
                                                const rate = ((recipe.selling_price - recipe.total_cost) / recipe.selling_price) * 100;
                                                const color = rate >= 30 ? "text-green-600" : rate >= 20 ? "text-blue-600" : "text-red-600";
                                                return <span className={`text-sm font-bold ${color}`}>{rate.toFixed(1)}%</span>;
                                            }
                                        })()}
                                    </TableCell>
                                    )}
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 text-gray-400 hover:text-blue-500"
                                                title="名称変更"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRenameRecipe(recipe.id, recipe.name);
                                                }}
                                            >
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 text-gray-400 hover:text-green-500"
                                                title="複製"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDuplicateRecipe(recipe);
                                                }}
                                            >
                                                <Copy className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                                                title="削除"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteRecipe(recipe.id, recipe.name);
                                                }}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div >
    );
}
