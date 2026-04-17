// app/recipe/product-link/page.tsx
// 統合商品紐付け管理（WEB販売 + 卸販売）
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Link2, Unlink, RefreshCw, CheckCircle2, Circle, Plus, ShoppingCart, Store } from "lucide-react";
import { toast } from "sonner";

interface Recipe {
    id: string;
    name: string;
    selling_price: number | null;
    total_cost: number | null;
    linked_product_id: string | null;
    linked_wholesale_product_id: string | null;
    category: string;
}

interface WebProduct {
    id: string;
    name: string;
    price: number | null;
    profit_rate: number | null;
}

interface WholesaleProduct {
    id: string;
    name: string;
    product_code: string;
    price: number | null;
    profit_rate: number | null;
}

// 各行のstate管理コンポーネント
function RecipeRow({
    recipe,
    webProducts,
    wholesaleProducts,
    usedWebIds,
    usedWholesaleIds,
    onLink,
    onUnlink,
    onCreateAndLink,
    formatCurrency,
}: {
    recipe: Recipe;
    webProducts: WebProduct[];
    wholesaleProducts: WholesaleProduct[];
    usedWebIds: Set<string>;
    usedWholesaleIds: Set<string>;
    onLink: (recipeId: string, type: "web" | "wholesale", productId: string) => void;
    onUnlink: (recipeId: string, type: "web" | "wholesale") => void;
    onCreateAndLink: (recipeId: string, recipeName: string, recipePrice: number | null, type: "web" | "wholesale") => void;
    formatCurrency: (v: number | null) => string;
}) {
    const [selectedWebId, setSelectedWebId] = useState<string>("__none__");
    const [selectedWholesaleId, setSelectedWholesaleId] = useState<string>("__none__");

    const availableWeb = webProducts.filter(p => !usedWebIds.has(p.id));
    const availableWholesale = wholesaleProducts.filter(p => !usedWholesaleIds.has(p.id));

    const linkedWeb = recipe.linked_product_id ? webProducts.find(p => p.id === recipe.linked_product_id) : null;
    const linkedWholesale = recipe.linked_wholesale_product_id ? wholesaleProducts.find(p => p.id === recipe.linked_wholesale_product_id) : null;

    return (
        <TableRow>
            <TableCell className="font-medium text-sm">{recipe.name}</TableCell>
            <TableCell className="text-center">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    recipe.category === 'ネット専用' ? 'bg-blue-100 text-blue-700' :
                    recipe.category === '自社' ? 'bg-green-100 text-green-700' :
                    'bg-purple-100 text-purple-700'
                }`}>{recipe.category}</span>
            </TableCell>
            <TableCell className="text-right text-sm">{formatCurrency(recipe.selling_price)}</TableCell>
            {/* WEB販売 紐付け */}
            <TableCell>
                {linkedWeb ? (
                    <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        <span className="text-xs text-blue-700 font-medium truncate max-w-[160px]" title={linkedWeb.name}>{linkedWeb.name}</span>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-600 flex-shrink-0"
                            onClick={() => onUnlink(recipe.id, "web")}>
                            <Unlink className="w-3 h-3" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1">
                        <Select value={selectedWebId} onValueChange={setSelectedWebId}>
                            <SelectTrigger className="h-7 text-xs w-[160px]">
                                <SelectValue>{selectedWebId !== "__none__" ? availableWeb.find(p => p.id === selectedWebId)?.name || "..." : "選択..."}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__"><span className="text-gray-400">— 選択 —</span></SelectItem>
                                {availableWeb.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}{p.price ? ` (¥${p.price.toLocaleString()})` : ""}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedWebId !== "__none__" ? (
                            <Button size="sm" className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700 px-2"
                                onClick={() => { onLink(recipe.id, "web", selectedWebId); setSelectedWebId("__none__"); }}>
                                <Link2 className="w-3 h-3" />
                            </Button>
                        ) : (
                            <Button size="sm" variant="outline" className="h-7 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-50 px-2"
                                onClick={() => onCreateAndLink(recipe.id, recipe.name, recipe.selling_price, "web")}>
                                <Plus className="w-3 h-3" />
                            </Button>
                        )}
                    </div>
                )}
            </TableCell>
            {/* 卸販売 紐付け */}
            <TableCell>
                {linkedWholesale ? (
                    <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        <span className="text-xs text-green-700 font-medium truncate max-w-[160px]" title={linkedWholesale.name}>{linkedWholesale.name}</span>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-600 flex-shrink-0"
                            onClick={() => onUnlink(recipe.id, "wholesale")}>
                            <Unlink className="w-3 h-3" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1">
                        <Select value={selectedWholesaleId} onValueChange={setSelectedWholesaleId}>
                            <SelectTrigger className="h-7 text-xs w-[160px]">
                                <SelectValue>{selectedWholesaleId !== "__none__" ? availableWholesale.find(p => p.id === selectedWholesaleId)?.name || "..." : "選択..."}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__"><span className="text-gray-400">— 選択 —</span></SelectItem>
                                {availableWholesale.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}{p.price ? ` (¥${p.price.toLocaleString()})` : ""}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedWholesaleId !== "__none__" ? (
                            <Button size="sm" className="h-7 text-[10px] bg-green-600 hover:bg-green-700 px-2"
                                onClick={() => { onLink(recipe.id, "wholesale", selectedWholesaleId); setSelectedWholesaleId("__none__"); }}>
                                <Link2 className="w-3 h-3" />
                            </Button>
                        ) : (
                            <Button size="sm" variant="outline" className="h-7 text-[10px] border-green-300 text-green-700 hover:bg-green-50 px-2"
                                onClick={() => onCreateAndLink(recipe.id, recipe.name, recipe.selling_price, "wholesale")}>
                                <Plus className="w-3 h-3" />
                            </Button>
                        )}
                    </div>
                )}
            </TableCell>
        </TableRow>
    );
}

export default function ProductLinkPage() {
    const router = useRouter();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [webProducts, setWebProducts] = useState<WebProduct[]>([]);
    const [wholesaleProducts, setWholesaleProducts] = useState<WholesaleProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState<string>("all");

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [webRes, wholesaleRes] = await Promise.all([
                fetch("/api/recipe/sync-product"),
                fetch("/api/recipe/sync-wholesale"),
            ]);
            if (!webRes.ok || !wholesaleRes.ok) throw new Error("データ取得に失敗しました");
            const webData = await webRes.json();
            const wholesaleData = await wholesaleRes.json();

            // recipesはWEB販売APIから取得（全カテゴリ必要なので後でAPI修正）
            // 両方からレシピを統合（idでdedupe）
            const recipeMap = new Map<string, Recipe>();
            for (const r of webData.recipes || []) {
                recipeMap.set(r.id, { ...r, linked_wholesale_product_id: null });
            }
            for (const r of wholesaleData.recipes || []) {
                if (recipeMap.has(r.id)) {
                    recipeMap.get(r.id)!.linked_wholesale_product_id = r.linked_wholesale_product_id;
                } else {
                    recipeMap.set(r.id, { ...r, linked_product_id: null });
                }
            }

            setRecipes(Array.from(recipeMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
            setWebProducts(webData.products || []);
            setWholesaleProducts(wholesaleData.products || []);
        } catch (error: any) {
            toast.error(error.message);
        } finally { setLoading(false); }
    };

    const handleLink = async (recipeId: string, type: "web" | "wholesale", productId: string) => {
        const endpoint = type === "web" ? "/api/recipe/sync-product" : "/api/recipe/sync-wholesale";
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipeId, productId }),
            });
            if (!res.ok) throw new Error("紐付けに失敗しました");
            toast.success("紐付けしました");
            fetchData();
        } catch (error: any) { toast.error(error.message); }
    };

    const handleUnlink = async (recipeId: string, type: "web" | "wholesale") => {
        if (!confirm("紐付けを解除しますか？")) return;
        const endpoint = type === "web" ? "/api/recipe/sync-product" : "/api/recipe/sync-wholesale";
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipeId, productId: null }),
            });
            if (!res.ok) throw new Error("解除に失敗しました");
            toast.success("紐付けを解除しました");
            fetchData();
        } catch (error: any) { toast.error(error.message); }
    };

    const handleCreateAndLink = async (recipeId: string, recipeName: string, recipePrice: number | null, type: "web" | "wholesale") => {
        const label = type === "web" ? "WEB販売" : "卸販売";
        if (!confirm(`${label}管理に「${recipeName}」を新規作成して紐付けます。\nよろしいですか？`)) return;
        const endpoint = type === "web" ? "/api/recipe/sync-product" : "/api/recipe/sync-wholesale";
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ createAndLink: true, recipeId, recipeName, recipePrice }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "作成に失敗しました");
            }
            const result = await res.json();
            toast.success(`「${result.productName}」を${label}に新規作成して紐付けました`);
            fetchData();
        } catch (error: any) { toast.error(error.message); }
    };

    const handleSyncAll = async () => {
        setSyncing(true);
        try {
            const [r1, r2] = await Promise.all([
                fetch("/api/recipe/sync-product", { method: "PUT" }),
                fetch("/api/recipe/sync-wholesale", { method: "PUT" }),
            ]);
            const d1 = await r1.json();
            const d2 = await r2.json();
            toast.success(`WEB: ${d1.synced || 0}件、卸: ${d2.synced || 0}件を同期しました`);
            fetchData();
        } catch (error: any) { toast.error(error.message); }
        finally { setSyncing(false); }
    };

    const formatCurrency = (v: number | null) => (v ? `¥${v.toLocaleString()}` : "-");

    // Derived
    const usedWebIds = new Set(recipes.filter(r => r.linked_product_id).map(r => r.linked_product_id!));
    const usedWholesaleIds = new Set(recipes.filter(r => r.linked_wholesale_product_id).map(r => r.linked_wholesale_product_id!));

    const categories = [...new Set(recipes.map(r => r.category))].sort();

    const filteredRecipes = categoryFilter === "all"
        ? recipes
        : recipes.filter(r => r.category === categoryFilter);

    const webLinkedCount = recipes.filter(r => r.linked_product_id).length;
    const wholesaleLinkedCount = recipes.filter(r => r.linked_wholesale_product_id).length;

    if (loading) {
        return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
    }

    return (
        <div className="max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <Button variant="ghost" size="sm" onClick={() => router.push("/recipe")}>
                            <ArrowLeft className="w-4 h-4 mr-1" /> レシピ一覧
                        </Button>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Link2 className="w-7 h-7" />
                        商品紐付け管理
                    </h1>
                    <p className="text-gray-500 mt-1">
                        レシピごとにWEB販売商品・卸販売商品を手動選択、または新規作成して紐付け
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleSyncAll} disabled={syncing} variant="outline">
                        <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} /> 全件同期
                    </Button>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-sm text-gray-500">レシピ数</div>
                        <div className="text-2xl font-bold">{recipes.length}</div>
                    </CardContent>
                </Card>
                <Card className="border-blue-200">
                    <CardContent className="pt-4 pb-3 flex items-center gap-3">
                        <ShoppingCart className="w-5 h-5 text-blue-600" />
                        <div>
                            <div className="text-sm text-blue-600">WEB販売 紐付け済</div>
                            <div className="text-2xl font-bold text-blue-700">{webLinkedCount} <span className="text-sm font-normal text-gray-400">/ {recipes.length}</span></div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-green-200">
                    <CardContent className="pt-4 pb-3 flex items-center gap-3">
                        <Store className="w-5 h-5 text-green-600" />
                        <div>
                            <div className="text-sm text-green-600">卸販売 紐付け済</div>
                            <div className="text-2xl font-bold text-green-700">{wholesaleLinkedCount} <span className="text-sm font-normal text-gray-400">/ {recipes.length}</span></div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-3 mb-4">
                <span className="text-sm text-gray-500">カテゴリ:</span>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[150px] h-8 text-sm bg-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">すべて ({recipes.length})</SelectItem>
                        {categories.map(c => (
                            <SelectItem key={c} value={c}>{c} ({recipes.filter(r => r.category === c).length})</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <span className="text-sm text-gray-400 ml-auto">{filteredRecipes.length} 件表示中</span>
            </div>

            {/* Main Table */}
            <Card className="mb-6">
                <CardContent className="p-0">
                    <div className="overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-50">
                                    <TableHead className="min-w-[200px]">レシピ名</TableHead>
                                    <TableHead className="text-center w-[80px]">区分</TableHead>
                                    <TableHead className="text-right w-[90px]">販売価格</TableHead>
                                    <TableHead className="w-[300px]">
                                        <div className="flex items-center gap-1 text-blue-700">
                                            <ShoppingCart className="w-3.5 h-3.5" /> WEB販売
                                        </div>
                                    </TableHead>
                                    <TableHead className="w-[300px]">
                                        <div className="flex items-center gap-1 text-green-700">
                                            <Store className="w-3.5 h-3.5" /> 卸販売
                                        </div>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRecipes.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">該当するレシピがありません</TableCell></TableRow>
                                ) : (
                                    filteredRecipes.map(recipe => (
                                        <RecipeRow
                                            key={recipe.id}
                                            recipe={recipe}
                                            webProducts={webProducts}
                                            wholesaleProducts={wholesaleProducts}
                                            usedWebIds={usedWebIds}
                                            usedWholesaleIds={usedWholesaleIds}
                                            onLink={handleLink}
                                            onUnlink={handleUnlink}
                                            onCreateAndLink={handleCreateAndLink}
                                            formatCurrency={formatCurrency}
                                        />
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
