// app/recipe/product-link/page.tsx
// WEB販売商品 → レシピ 紐付け管理（WEB販売ベース版）
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ArrowLeft, Link2, Unlink, RefreshCw, Check, X, AlertTriangle, Sparkles, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

interface Recipe {
    id: string;
    name: string;
    selling_price: number | null;
    total_cost: number | null;
    linked_product_id: string | null;
    category: string;
}

interface Product {
    id: string;
    name: string;
    price: number | null;
    profit_rate: number | null;
    series: string | null;
    series_code: number | null;
    product_code: number | null;
}

interface Suggestion {
    recipeId: string;
    recipeName: string;
    recipePrice: number | null;
    productId: string | null;
    productName: string | null;
    productPrice: number | null;
    score: number;
    confidence: "high" | "medium" | "low" | "none";
}

interface EditableSuggestion extends Suggestion {
    accepted: boolean;
    overrideProductId: string | null;
}

export default function ProductLinkPage() {
    const router = useRouter();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [matching, setMatching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const [suggestions, setSuggestions] = useState<EditableSuggestion[]>([]);
    const [step, setStep] = useState<"overview" | "matching">("overview");

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/recipe/sync-product");
            if (!res.ok) throw new Error("データ取得に失敗しました");
            const data = await res.json();
            setRecipes(data.recipes || []);
            setProducts(data.products || []);
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAutoMatch = async () => {
        setMatching(true);
        try {
            const res = await fetch("/api/recipe/sync-product?autoMatch=true");
            if (!res.ok) throw new Error("マッチングに失敗しました");
            const data = await res.json();

            const editableSuggestions: EditableSuggestion[] = (data.suggestions || []).map((s: Suggestion) => ({
                ...s,
                accepted: s.confidence === "high" || s.confidence === "medium",
                overrideProductId: null,
            }));

            setSuggestions(editableSuggestions);
            setRecipes(data.recipes || []);
            setProducts(data.products || []);
            setStep("matching");
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setMatching(false);
        }
    };

    // 1商品ずつ個別に紐づけ
    const handleLinkOne = async (recipeId: string, productId: string) => {
        try {
            const res = await fetch("/api/recipe/sync-product", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipeId, productId }),
            });
            if (!res.ok) throw new Error("紐付けに失敗しました");
            toast.success("紐付けしました");
            // suggestionsから該当行を消す
            setSuggestions(prev => prev.filter(s => s.recipeId !== recipeId));
            fetchData();
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    // 全解除
    const handleUnlinkAll = async () => {
        if (!confirm(`紐付け済み${linkedCount}件を全て解除しますか？\nこの操作は元に戻せません。`)) return;
        setSaving(true);
        try {
            const unlinkTargets = linkedRecipes.map(r => r.id);
            const res = await fetch("/api/recipe/sync-product", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ batch: true, links: unlinkTargets.map(id => ({ recipeId: id, productId: null })) }),
            });
            if (!res.ok) throw new Error("全解除に失敗しました");
            toast.success(`${unlinkTargets.length}件の紐付けを解除しました`);
            fetchData();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleUnlink = async (recipeId: string) => {
        if (!confirm("紐付けを解除しますか？")) return;
        try {
            const res = await fetch("/api/recipe/sync-product", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipeId, productId: null }),
            });
            if (!res.ok) throw new Error("解除に失敗しました");
            toast.success("紐付けを解除しました");
            fetchData();
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleSyncAll = async () => {
        setSyncing(true);
        try {
            const res = await fetch("/api/recipe/sync-product", { method: "PUT" });
            if (!res.ok) throw new Error("同期に失敗しました");
            const data = await res.json();
            toast.success(`${data.synced}件のデータを同期しました`);
            fetchData();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setSyncing(false);
        }
    };

    const toggleAccept = (recipeId: string) => {
        setSuggestions((prev) =>
            prev.map((s) => (s.recipeId === recipeId ? { ...s, accepted: !s.accepted } : s))
        );
    };

    const overrideProduct = (recipeId: string, productId: string | null) => {
        setSuggestions((prev) =>
            prev.map((s) =>
                s.recipeId === recipeId
                    ? { ...s, overrideProductId: productId, accepted: productId ? true : s.accepted }
                    : s
            )
        );
    };

    // Derived data
    const linkedRecipes = recipes.filter((r) => r.linked_product_id);
    const linkedProductIds = new Set(linkedRecipes.map((r) => r.linked_product_id!));
    const getRecipeForProduct = (productId: string) => recipes.find((r) => r.linked_product_id === productId);
    const formatCurrency = (v: number | null) => (v ? `¥${v.toLocaleString()}` : "-");

    // WEB販売ベースの分類
    const linkedProducts = products.filter((p) => linkedProductIds.has(p.id));
    const unlinkedProducts = products.filter((p) => !linkedProductIds.has(p.id));
    const linkedCount = linkedProducts.length;
    const totalProductCount = products.length;
    const progressPercent = totalProductCount > 0 ? Math.round((linkedCount / totalProductCount) * 100) : 0;
    const isComplete = linkedCount === totalProductCount && totalProductCount > 0;

    const getConfidenceBadge = (confidence: string, score: number) => {
        switch (confidence) {
            case "high":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        ✓ 高確度 {score}%
                    </span>
                );
            case "medium":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                        △ 中確度 {score}%
                    </span>
                );
            case "low":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                        ✗ 低確度 {score}%
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                        — 候補なし
                    </span>
                );
        }
    };

    const getAvailableProducts = (currentSuggestion: EditableSuggestion) => {
        const usedIds = new Set(
            suggestions
                .filter((s) => s.recipeId !== currentSuggestion.recipeId && s.accepted)
                .map((s) => s.overrideProductId || s.productId)
                .filter(Boolean) as string[]
        );
        return products.filter((p) => !linkedProductIds.has(p.id) && !usedIds.has(p.id));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto">
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
                        WEB販売商品 → レシピ 紐付け管理
                    </h1>
                    <p className="text-gray-500 mt-1">
                        WEB販売管理の全商品にレシピを紐付けて、価格・利益率を自動同期
                    </p>
                </div>
                <div className="flex gap-2">
                    {step === "overview" && (
                        <>
                            <Button
                                onClick={handleUnlinkAll}
                                disabled={saving || linkedCount === 0}
                                variant="outline"
                                className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                                <Unlink className="w-4 h-4 mr-2" />
                                全解除（{linkedCount}件）
                            </Button>
                            <Button
                                onClick={handleSyncAll}
                                disabled={syncing || linkedCount === 0}
                                variant="outline"
                            >
                                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                                全件同期
                            </Button>
                            <Button
                                onClick={handleAutoMatch}
                                disabled={matching || unlinkedProducts.length === 0}
                                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                            >
                                <Sparkles className={`w-4 h-4 mr-2 ${matching ? "animate-spin" : ""}`} />
                                {matching ? "マッチング中..." : `AIマッチング（未紐付${unlinkedProducts.length}件）`}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">紐付け進捗</span>
                    <span className={`text-sm font-bold ${isComplete ? "text-green-600" : "text-amber-600"}`}>
                        {linkedCount} / {totalProductCount} 商品 ({progressPercent}%)
                    </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                        className={`h-3 rounded-full transition-all duration-500 ${isComplete ? "bg-green-500" : "bg-blue-500"}`}
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
                {isComplete && (
                    <div className="mt-2 flex items-center gap-2 text-green-600 font-medium">
                        <CheckCircle2 className="w-5 h-5" />
                        全商品の紐付けが完了しています！
                    </div>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-sm text-gray-500">WEB販売商品</div>
                        <div className="text-2xl font-bold">{totalProductCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-sm text-gray-500">レシピ（ネット専用）</div>
                        <div className="text-2xl font-bold">{recipes.length}</div>
                    </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50">
                    <CardContent className="pt-4 pb-3">
                        <div className="text-sm text-green-700">紐付け済み</div>
                        <div className="text-2xl font-bold text-green-700">{linkedCount}</div>
                    </CardContent>
                </Card>
                <Card className={`${unlinkedProducts.length === 0 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                    <CardContent className="pt-4 pb-3">
                        <div className={`text-sm ${unlinkedProducts.length === 0 ? "text-green-700" : "text-amber-700"}`}>未紐付け</div>
                        <div className={`text-2xl font-bold ${unlinkedProducts.length === 0 ? "text-green-700" : "text-amber-700"}`}>{unlinkedProducts.length}</div>
                    </CardContent>
                </Card>
            </div>

            {/* ===== Matching Step ===== */}
            {step === "matching" && (
                <Card className="mb-6 border-purple-200">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-purple-600" />
                                AIマッチング結果（{suggestions.length}件）
                            </CardTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStep("overview")}
                            >
                                <X className="w-4 h-4 mr-1" /> 閉じる
                            </Button>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            各行の「紐づけ」ボタンで1商品ずつ確定できます。商品をプルダウンで変更してから紐づけも可能です。
                        </p>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>レシピ名</TableHead>
                                    <TableHead className="text-right">販売価格</TableHead>
                                    <TableHead className="w-[40px] text-center">→</TableHead>
                                    <TableHead>マッチ商品名（AI提案 or 手動選択）</TableHead>
                                    <TableHead className="text-right">商品価格</TableHead>
                                    <TableHead>確度</TableHead>
                                    <TableHead className="w-[90px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {suggestions.map((s) => {
                                    const availProducts = getAvailableProducts(s);
                                    const effectiveProductId = s.overrideProductId || s.productId;
                                    const effectiveProduct = effectiveProductId
                                        ? products.find((p) => p.id === effectiveProductId)
                                        : null;

                                    return (
                                        <TableRow
                                            key={s.recipeId}
                                            className={
                                                s.accepted
                                                    ? "bg-green-50/50"
                                                    : s.confidence === "none"
                                                        ? "bg-gray-50/50"
                                                        : ""
                                            }
                                        >

                                            <TableCell className="font-medium text-sm">
                                                {s.recipeName}
                                            </TableCell>
                                            <TableCell className="text-right text-sm">
                                                {formatCurrency(s.recipePrice)}
                                            </TableCell>
                                            <TableCell className="text-center text-gray-400">→</TableCell>
                                            <TableCell>
                                                <Select
                                                    value={effectiveProductId || "__none__"}
                                                    onValueChange={(val) =>
                                                        overrideProduct(
                                                            s.recipeId,
                                                            val === "__none__" ? null : val
                                                        )
                                                    }
                                                >
                                                    <SelectTrigger
                                                        className={`h-8 text-sm ${s.overrideProductId
                                                            ? "border-blue-300 bg-blue-50"
                                                            : s.confidence === "high"
                                                                ? "border-green-300"
                                                                : s.confidence === "medium"
                                                                    ? "border-yellow-300"
                                                                    : "border-gray-300"
                                                            }`}
                                                    >
                                                        <SelectValue>
                                                            {effectiveProduct
                                                                ? (s.overrideProductId ? "🔧 " : "") +
                                                                effectiveProduct.name
                                                                : "商品を選択..."}
                                                        </SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="__none__">
                                                            <span className="text-gray-400">— 紐付けなし —</span>
                                                        </SelectItem>
                                                        {s.productId && (
                                                            <SelectItem value={s.productId}>
                                                                ⭐ {s.productName} （AI提案 {s.score}%）
                                                            </SelectItem>
                                                        )}
                                                        {availProducts
                                                            .filter((p) => p.id !== s.productId)
                                                            .map((p) => (
                                                                <SelectItem key={p.id} value={p.id}>
                                                                    {p.name}
                                                                    {p.price ? ` (¥${p.price.toLocaleString()})` : ""}
                                                                </SelectItem>
                                                            ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="text-right text-sm">
                                                {formatCurrency(effectiveProduct?.price || null)}
                                            </TableCell>
                                            <TableCell>
                                                {s.overrideProductId
                                                    ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                                                            🔧 手動
                                                        </span>
                                                    )
                                                    : getConfidenceBadge(s.confidence, s.score)}
                                            </TableCell>
                                            <TableCell>
                                                {effectiveProductId && (
                                                    <Button
                                                        size="sm"
                                                        className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                                        onClick={() => handleLinkOne(s.recipeId, effectiveProductId)}
                                                    >
                                                        <Link2 className="w-3 h-3 mr-1" />
                                                        紐づけ
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* ===== WEB販売商品ベースの紐付け一覧 ===== */}
            {step === "overview" && (
                <>
                    {/* 未紐付け商品（先に表示） */}
                    {unlinkedProducts.length > 0 && (
                        <Card className="mb-6 border-amber-200">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2 text-amber-700">
                                    <Circle className="w-5 h-5" />
                                    未紐付け WEB販売商品（{unlinkedProducts.length}件）
                                </CardTitle>
                                <p className="text-sm text-gray-500 mt-1">
                                    AIマッチングボタンで一括紐付けできます
                                </p>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[30px]">状態</TableHead>
                                            <TableHead>WEB販売商品名</TableHead>
                                            <TableHead className="text-right">商品価格</TableHead>
                                            <TableHead className="text-right">利益率</TableHead>
                                            <TableHead>紐付けレシピ</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {unlinkedProducts.map((product) => (
                                            <TableRow key={product.id} className="bg-amber-50/30">
                                                <TableCell>
                                                    <Circle className="w-4 h-4 text-amber-400" />
                                                </TableCell>
                                                <TableCell className="font-medium">{product.name}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(product.price)}</TableCell>
                                                <TableCell className="text-right">
                                                    {product.profit_rate != null ? `${product.profit_rate}%` : "-"}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-gray-400 text-sm">— 未紐付け</span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}

                    {/* 紐付け済み商品 */}
                    <Card className="mb-6 border-green-200">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2 text-green-700">
                                <CheckCircle2 className="w-5 h-5" />
                                紐付け済み WEB販売商品（{linkedCount}件）
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {linkedProducts.length === 0 ? (
                                <p className="text-gray-400 text-center py-4">紐付け済みの商品はありません</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[30px]">状態</TableHead>
                                            <TableHead>WEB販売商品名</TableHead>
                                            <TableHead className="text-right">商品価格</TableHead>
                                            <TableHead className="text-right">利益率</TableHead>
                                            <TableHead className="text-center">↔</TableHead>
                                            <TableHead>レシピ名</TableHead>
                                            <TableHead className="text-right">レシピ販売価格</TableHead>
                                            <TableHead className="text-right">原価</TableHead>
                                            <TableHead className="text-center">同期</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {linkedProducts.map((product) => {
                                            const recipe = getRecipeForProduct(product.id);
                                            const priceMismatch = recipe && recipe.selling_price !== product.price;
                                            return (
                                                <TableRow key={product.id}>
                                                    <TableCell>
                                                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                                                    </TableCell>
                                                    <TableCell className="font-medium">{product.name}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(product.price)}</TableCell>
                                                    <TableCell className="text-right">
                                                        {product.profit_rate != null ? `${product.profit_rate}%` : "-"}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Link2 className="w-4 h-4 mx-auto text-green-500" />
                                                    </TableCell>
                                                    <TableCell className="font-medium text-blue-700">
                                                        {recipe?.name || "（レシピ不明）"}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className={priceMismatch ? "text-red-500 font-bold" : ""}>
                                                            {formatCurrency(recipe?.selling_price || null)}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {formatCurrency(recipe?.total_cost || null)}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {priceMismatch ? (
                                                            <span className="flex items-center justify-center gap-1 text-amber-600 text-xs">
                                                                <AlertTriangle className="w-3 h-3" />
                                                                差異
                                                            </span>
                                                        ) : (
                                                            <span className="text-green-600 text-xs">✓</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {recipe && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-red-400 hover:text-red-600"
                                                                onClick={() => handleUnlink(recipe.id)}
                                                            >
                                                                <Unlink className="w-4 h-4" />
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
