// app/recipe/product-link/page.tsx
// レシピ ↔ WEB販売商品 自動マッチング＆紐付け管理
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, Link2, Unlink, RefreshCw, Check, X, AlertTriangle, Sparkles, ChevronRight } from "lucide-react";
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

// Editable suggestion row state
interface EditableSuggestion extends Suggestion {
    accepted: boolean;
    overrideProductId: string | null; // User can override the AI suggestion
}

export default function ProductLinkPage() {
    const router = useRouter();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [matching, setMatching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // Matching results
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

    const handleApplyAll = async () => {
        const accepted = suggestions.filter((s) => s.accepted && (s.overrideProductId || s.productId));
        if (accepted.length === 0) {
            toast.error("適用する紐付けがありません");
            return;
        }

        setSaving(true);
        try {
            const links = accepted.map((s) => ({
                recipeId: s.recipeId,
                productId: s.overrideProductId || s.productId,
            }));

            const res = await fetch("/api/recipe/sync-product", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ batch: true, links }),
            });

            if (!res.ok) throw new Error("適用に失敗しました");
            const data = await res.json();
            toast.success(`${data.linked}件の紐付けを完了しました`);
            setStep("overview");
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
    const unlinkedCount = recipes.length - linkedRecipes.length;
    const linkedProductIds = new Set(linkedRecipes.map((r) => r.linked_product_id!));
    const getProduct = (id: string) => products.find((p) => p.id === id);
    const formatCurrency = (v: number | null) => (v ? `¥${v.toLocaleString()}` : "-");

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

    // Available products for manual override (not yet used in suggestions)
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
                        レシピ ↔ WEB販売 紐付け管理
                    </h1>
                    <p className="text-gray-500 mt-1">
                        レシピ（ネット専用）とWEB販売管理の商品を紐付けて、価格・利益率を自動同期
                    </p>
                </div>
                <div className="flex gap-2">
                    {step === "overview" && (
                        <>
                            <Button
                                onClick={handleSyncAll}
                                disabled={syncing || linkedRecipes.length === 0}
                                variant="outline"
                            >
                                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                                全件同期
                            </Button>
                            <Button
                                onClick={handleAutoMatch}
                                disabled={matching || unlinkedCount === 0}
                                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                            >
                                <Sparkles className={`w-4 h-4 mr-2 ${matching ? "animate-spin" : ""}`} />
                                {matching ? "マッチング中..." : `AIマッチング（${unlinkedCount}件未紐付け）`}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-sm text-gray-500">レシピ（ネット専用）</div>
                        <div className="text-2xl font-bold">{recipes.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-sm text-gray-500">WEB販売商品</div>
                        <div className="text-2xl font-bold">{products.length}</div>
                    </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50">
                    <CardContent className="pt-4 pb-3">
                        <div className="text-sm text-green-700">紐付け済み</div>
                        <div className="text-2xl font-bold text-green-700">{linkedRecipes.length}</div>
                    </CardContent>
                </Card>
                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="pt-4 pb-3">
                        <div className="text-sm text-amber-700">未紐付け</div>
                        <div className="text-2xl font-bold text-amber-700">{unlinkedCount}</div>
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
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setStep("overview")}
                                >
                                    <X className="w-4 h-4 mr-1" /> キャンセル
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleApplyAll}
                                    disabled={saving}
                                    className="bg-green-600 hover:bg-green-700"
                                >
                                    <Check className="w-4 h-4 mr-1" />
                                    {saving ? "適用中..." : `チェック済み${suggestions.filter((s) => s.accepted).length}件を適用`}
                                </Button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            ✓ 高/中確度は自動チェック済み。低確度や候補なしは手動で商品を選択してください。
                        </p>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[40px]">適用</TableHead>
                                    <TableHead>レシピ名</TableHead>
                                    <TableHead className="text-right">販売価格</TableHead>
                                    <TableHead className="w-[40px] text-center">→</TableHead>
                                    <TableHead>マッチ商品名（AI提案 or 手動選択）</TableHead>
                                    <TableHead className="text-right">商品価格</TableHead>
                                    <TableHead>確度</TableHead>
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
                                            <TableCell>
                                                <input
                                                    type="checkbox"
                                                    checked={s.accepted}
                                                    onChange={() => toggleAccept(s.recipeId)}
                                                    disabled={!effectiveProductId}
                                                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium text-sm">
                                                {s.recipeName}
                                            </TableCell>
                                            <TableCell className="text-right text-sm">
                                                {formatCurrency(s.recipePrice)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <ChevronRight className="w-4 h-4 text-gray-400 mx-auto" />
                                            </TableCell>
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
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* ===== Linked Recipes (always shown) ===== */}
            <Card className="mb-6">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Check className="w-5 h-5 text-green-600" />
                        紐付け済み（{linkedRecipes.length}件）
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {linkedRecipes.length === 0 ? (
                        <p className="text-gray-400 text-center py-4">紐付け済みの商品はありません</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>レシピ名</TableHead>
                                    <TableHead className="text-right">販売価格</TableHead>
                                    <TableHead className="text-right">原価</TableHead>
                                    <TableHead className="text-center">↔</TableHead>
                                    <TableHead>WEB販売商品名</TableHead>
                                    <TableHead className="text-right">商品価格</TableHead>
                                    <TableHead className="text-right">利益率</TableHead>
                                    <TableHead className="text-center">状態</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {linkedRecipes.map((recipe) => {
                                    const product = getProduct(recipe.linked_product_id!);
                                    const priceMismatch =
                                        product && recipe.selling_price !== product.price;
                                    return (
                                        <TableRow key={recipe.id}>
                                            <TableCell className="font-medium">{recipe.name}</TableCell>
                                            <TableCell className="text-right">
                                                {formatCurrency(recipe.selling_price)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {formatCurrency(recipe.total_cost)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Link2 className="w-4 h-4 mx-auto text-green-500" />
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {product?.name || "（削除済み）"}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className={priceMismatch ? "text-red-500 font-bold" : ""}>
                                                    {formatCurrency(product?.price || null)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {product?.profit_rate != null ? `${product.profit_rate}%` : "-"}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {priceMismatch ? (
                                                    <span className="flex items-center gap-1 text-amber-600 text-xs">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        差異あり
                                                    </span>
                                                ) : (
                                                    <span className="text-green-600 text-xs">✓ 同期済</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-400 hover:text-red-600"
                                                    onClick={() => handleUnlink(recipe.id)}
                                                >
                                                    <Unlink className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Unlinked products info */}
            {step === "overview" && (
                <Card className="border-gray-200">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2 text-gray-500">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            WEB販売にあってレシピに無い商品（{products.filter((p) => !linkedProductIds.has(p.id)).length}件）
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {products
                                .filter((p) => !linkedProductIds.has(p.id))
                                .map((p) => (
                                    <span
                                        key={p.id}
                                        className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs border"
                                    >
                                        {p.name} {p.price ? `(¥${p.price.toLocaleString()})` : ""}
                                    </span>
                                ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
