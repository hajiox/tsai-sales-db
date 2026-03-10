// app/recipe/oem-link/page.tsx
// OEM卸販売商品 → レシピ 紐付け管理
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
import { ArrowLeft, Link2, Unlink, RefreshCw, X, Sparkles, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Recipe {
    id: string;
    name: string;
    selling_price: number | null;
    total_cost: number | null;
    linked_oem_product_id: string | null;
    category: string;
}

interface OemProduct {
    id: string;
    name: string;
    product_code: string;
    price: number | null;
    profit_rate: number | null;
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

export default function OemLinkPage() {
    const router = useRouter();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [products, setProducts] = useState<OemProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [matching, setMatching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [suggestions, setSuggestions] = useState<EditableSuggestion[]>([]);
    const [step, setStep] = useState<"overview" | "matching">("overview");

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/recipe/sync-oem");
            if (!res.ok) throw new Error("データ取得に失敗しました");
            const data = await res.json();
            setRecipes(data.recipes || []);
            setProducts(data.products || []);
        } catch (error: any) {
            toast.error(error.message);
        } finally { setLoading(false); }
    };

    const handleAutoMatch = async () => {
        setMatching(true);
        try {
            const res = await fetch("/api/recipe/sync-oem?autoMatch=true");
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
        } finally { setMatching(false); }
    };

    const handleLinkOne = async (recipeId: string, productId: string) => {
        try {
            const res = await fetch("/api/recipe/sync-oem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipeId, productId }),
            });
            if (!res.ok) throw new Error("紐付けに失敗しました");
            toast.success("紐付けしました");
            setSuggestions(prev => prev.filter(s => s.recipeId !== recipeId));
            fetchData();
        } catch (error: any) { toast.error(error.message); }
    };

    // 一括紐づけ
    const handleBatchLink = async () => {
        const toLink = suggestions.filter(s => {
            const effectiveId = s.overrideProductId || s.productId;
            return s.accepted && effectiveId;
        });
        if (toLink.length === 0) {
            toast.error("紐付け対象がありません");
            return;
        }
        if (!confirm(`${toLink.length}件を一括紐づけしますか？`)) return;
        setSaving(true);
        try {
            const links = toLink.map(s => ({
                recipeId: s.recipeId,
                productId: s.overrideProductId || s.productId,
            }));
            const res = await fetch("/api/recipe/sync-oem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ batch: true, links }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "一括紐づけに失敗しました");
            }
            toast.success(`${toLink.length}件を紐づけしました`);
            setSuggestions([]);
            setStep("overview");
            fetchData();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleUnlinkAll = async () => {
        if (!confirm(`紐付け済み${linkedCount}件を全て解除しますか？`)) return;
        setSaving(true);
        try {
            const res = await fetch("/api/recipe/sync-oem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ batch: true, links: linkedRecipes.map(r => ({ recipeId: r.id, productId: null })) }),
            });
            if (!res.ok) throw new Error("全解除に失敗しました");
            toast.success(`${linkedRecipes.length}件の紐付けを解除しました`);
            fetchData();
        } catch (error: any) { toast.error(error.message); }
        finally { setSaving(false); }
    };

    const handleUnlink = async (recipeId: string) => {
        if (!confirm("紐付けを解除しますか？")) return;
        try {
            const res = await fetch("/api/recipe/sync-oem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipeId, productId: null }),
            });
            if (!res.ok) throw new Error("解除に失敗しました");
            toast.success("紐付けを解除しました");
            fetchData();
        } catch (error: any) { toast.error(error.message); }
    };

    const handleSyncAll = async () => {
        setSyncing(true);
        try {
            const res = await fetch("/api/recipe/sync-oem", { method: "PUT" });
            if (!res.ok) throw new Error("同期に失敗しました");
            const data = await res.json();
            toast.success(`${data.synced}件のデータを同期しました`);
            fetchData();
        } catch (error: any) { toast.error(error.message); }
        finally { setSyncing(false); }
    };

    const overrideProduct = (recipeId: string, productId: string | null) => {
        setSuggestions(prev => prev.map(s =>
            s.recipeId === recipeId
                ? { ...s, overrideProductId: productId, accepted: productId ? true : s.accepted }
                : s
        ));
    };

    // Derived
    const linkedRecipes = recipes.filter(r => r.linked_oem_product_id);
    const linkedProductIds = new Set(linkedRecipes.map(r => r.linked_oem_product_id!));
    const getRecipeForProduct = (productId: string) => recipes.find(r => r.linked_oem_product_id === productId);
    const formatCurrency = (v: number | null) => (v ? `¥${v.toLocaleString()}` : "-");

    const linkedProducts = products.filter(p => linkedProductIds.has(p.id));
    const unlinkedProducts = products.filter(p => !linkedProductIds.has(p.id));
    const linkedCount = linkedProducts.length;
    const totalProductCount = products.length;
    const progressPercent = totalProductCount > 0 ? Math.round((linkedCount / totalProductCount) * 100) : 0;
    const isComplete = linkedCount === totalProductCount && totalProductCount > 0;

    const getConfidenceBadge = (confidence: string, score: number) => {
        switch (confidence) {
            case "high": return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium">✓ 高確度 {score}%</span>;
            case "medium": return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">△ 中確度 {score}%</span>;
            case "low": return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs font-medium">✗ 低確度 {score}%</span>;
            default: return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">— 候補なし</span>;
        }
    };

    const getAvailableProducts = (currentSuggestion: EditableSuggestion) => {
        const usedIds = new Set(
            suggestions
                .filter(s => s.recipeId !== currentSuggestion.recipeId && s.accepted)
                .map(s => s.overrideProductId || s.productId)
                .filter(Boolean) as string[]
        );
        return products.filter(p => !linkedProductIds.has(p.id) && !usedIds.has(p.id));
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" /></div>;
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
                        <Link2 className="w-7 h-7 text-purple-600" />
                        OEM商品 → レシピ 紐付け管理
                    </h1>
                    <p className="text-gray-500 mt-1">
                        OEM卸販売商品にレシピを紐付けて、卸価格・利益率を自動同期（7掛ベース）
                    </p>
                </div>
                <div className="flex gap-2">
                    {step === "overview" && (
                        <>
                            <Button onClick={handleUnlinkAll} disabled={saving || linkedCount === 0} variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                                <Unlink className="w-4 h-4 mr-2" /> 全解除（{linkedCount}件）
                            </Button>
                            <Button onClick={handleSyncAll} disabled={syncing || linkedCount === 0} variant="outline">
                                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} /> 全件同期
                            </Button>
                            <Button onClick={handleAutoMatch} disabled={matching || unlinkedProducts.length === 0} className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700">
                                <Sparkles className={`w-4 h-4 mr-2 ${matching ? "animate-spin" : ""}`} />
                                {matching ? "マッチング中..." : `AIマッチング（未紐付${unlinkedProducts.length}件）`}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Progress */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">紐付け進捗</span>
                    <span className={`text-sm font-bold ${isComplete ? "text-purple-600" : "text-amber-600"}`}>
                        {linkedCount} / {totalProductCount} 商品 ({progressPercent}%)
                    </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                    <div className={`h-3 rounded-full transition-all duration-500 ${isComplete ? "bg-purple-500" : "bg-purple-400"}`} style={{ width: `${progressPercent}%` }} />
                </div>
                {isComplete && (
                    <div className="mt-2 flex items-center gap-2 text-purple-600 font-medium">
                        <CheckCircle2 className="w-5 h-5" /> 全OEM商品の紐付けが完了しています！
                    </div>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <Card><CardContent className="pt-4 pb-3"><div className="text-sm text-gray-500">OEM卸販売商品</div><div className="text-2xl font-bold">{totalProductCount}</div></CardContent></Card>
                <Card><CardContent className="pt-4 pb-3"><div className="text-sm text-gray-500">レシピ（OEM）</div><div className="text-2xl font-bold">{recipes.length}</div></CardContent></Card>
                <Card className="border-purple-200 bg-purple-50"><CardContent className="pt-4 pb-3"><div className="text-sm text-purple-700">紐付け済み</div><div className="text-2xl font-bold text-purple-700">{linkedCount}</div></CardContent></Card>
                <Card className={`${unlinkedProducts.length === 0 ? "border-purple-200 bg-purple-50" : "border-amber-200 bg-amber-50"}`}><CardContent className="pt-4 pb-3"><div className={`text-sm ${unlinkedProducts.length === 0 ? "text-purple-700" : "text-amber-700"}`}>未紐付け</div><div className={`text-2xl font-bold ${unlinkedProducts.length === 0 ? "text-purple-700" : "text-amber-700"}`}>{unlinkedProducts.length}</div></CardContent></Card>
            </div>

            {/* Matching Step */}
            {step === "matching" && (
                <Card className="mb-6 border-purple-200">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-purple-600" />
                                AIマッチング結果（{suggestions.length}件）
                            </CardTitle>
                            <Button variant="outline" size="sm" onClick={() => setStep("overview")}>
                                <X className="w-4 h-4 mr-1" /> 閉じる
                            </Button>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">各行の「紐づけ」ボタンで1商品ずつ確定、または下部の「一括紐づけ」でまとめて紐づけできます。</p>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>レシピ名</TableHead>
                                    <TableHead className="text-right">販売価格</TableHead>
                                    <TableHead className="w-[40px] text-center">→</TableHead>
                                    <TableHead>マッチ商品名（AI提案 or 手動選択）</TableHead>
                                    <TableHead className="text-right">卸価格</TableHead>
                                    <TableHead>確度</TableHead>
                                    <TableHead className="w-[90px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {suggestions.map(s => {
                                    const availProducts = getAvailableProducts(s);
                                    const effectiveProductId = s.overrideProductId || s.productId;
                                    const effectiveProduct = effectiveProductId ? products.find(p => p.id === effectiveProductId) : null;

                                    return (
                                        <TableRow key={s.recipeId} className={s.accepted ? "bg-purple-50/50" : s.confidence === "none" ? "bg-gray-50/50" : ""}>
                                            <TableCell className="font-medium text-sm">{s.recipeName}</TableCell>
                                            <TableCell className="text-right text-sm">{formatCurrency(s.recipePrice)}</TableCell>
                                            <TableCell className="text-center text-gray-400">→</TableCell>
                                            <TableCell>
                                                <Select value={effectiveProductId || "__none__"} onValueChange={val => overrideProduct(s.recipeId, val === "__none__" ? null : val)}>
                                                    <SelectTrigger className={`h-8 text-sm ${s.overrideProductId ? "border-blue-300 bg-blue-50" : s.confidence === "high" ? "border-green-300" : s.confidence === "medium" ? "border-yellow-300" : "border-gray-300"}`}>
                                                        <SelectValue>{effectiveProduct ? (s.overrideProductId ? "🔧 " : "") + effectiveProduct.name : "商品を選択..."}</SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="__none__"><span className="text-gray-400">— 紐付けなし —</span></SelectItem>
                                                        {s.productId && <SelectItem value={s.productId}>⭐ {s.productName} （AI提案 {s.score}%）</SelectItem>}
                                                        {availProducts.filter(p => p.id !== s.productId).map(p => (
                                                            <SelectItem key={p.id} value={p.id}>{p.name}{p.price ? ` (¥${p.price.toLocaleString()})` : ""}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="text-right text-sm">{formatCurrency(effectiveProduct?.price || null)}</TableCell>
                                            <TableCell>{s.overrideProductId ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">🔧 手動</span> : getConfidenceBadge(s.confidence, s.score)}</TableCell>
                                            <TableCell>
                                                {effectiveProductId && (
                                                    <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" onClick={() => handleLinkOne(s.recipeId, effectiveProductId)}>
                                                        <Link2 className="w-3 h-3 mr-1" /> 紐づけ
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                        {/* 一括紐づけボタン */}
                        {(() => {
                            const batchCount = suggestions.filter(s => s.accepted && (s.overrideProductId || s.productId)).length;
                            return batchCount > 0 ? (
                                <div className="mt-4 flex items-center justify-end gap-3 border-t pt-4">
                                    <span className="text-sm text-gray-500">
                                        商品選択済み: <span className="font-bold text-purple-700">{batchCount}件</span>
                                    </span>
                                    <Button
                                        onClick={handleBatchLink}
                                        disabled={saving}
                                        className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700"
                                    >
                                        <Link2 className="w-4 h-4 mr-2" />
                                        {saving ? "処理中..." : `${batchCount}件を一括紐づけ`}
                                    </Button>
                                </div>
                            ) : null;
                        })()}
                    </CardContent>
                </Card>
            )}

            {/* Overview */}
            {step === "overview" && (
                <>
                    {unlinkedProducts.length > 0 && (
                        <Card className="mb-6 border-amber-200">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2 text-amber-700">
                                    <Circle className="w-5 h-5" /> 未紐付け OEM商品（{unlinkedProducts.length}件）
                                </CardTitle>
                                <p className="text-sm text-gray-500 mt-1">AIマッチングボタンで一括紐付けできます</p>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[30px]">状態</TableHead>
                                            <TableHead>OEM商品名</TableHead>
                                            <TableHead className="text-right">卸価格</TableHead>
                                            <TableHead className="text-right">利益率</TableHead>
                                            <TableHead>紐付けレシピ</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {unlinkedProducts.map(product => (
                                            <TableRow key={product.id} className="bg-amber-50/30">
                                                <TableCell><Circle className="w-4 h-4 text-amber-400" /></TableCell>
                                                <TableCell className="font-medium">{product.name}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(product.price)}</TableCell>
                                                <TableCell className="text-right">{product.profit_rate != null ? `${product.profit_rate}%` : "-"}</TableCell>
                                                <TableCell><span className="text-gray-400 text-sm">— 未紐付け</span></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="mb-6 border-purple-200">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2 text-purple-700">
                                <CheckCircle2 className="w-5 h-5" /> 紐付け済み OEM商品（{linkedCount}件）
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
                                            <TableHead>OEM商品名</TableHead>
                                            <TableHead className="text-right">卸価格</TableHead>
                                            <TableHead className="text-right">利益率</TableHead>
                                            <TableHead className="text-center">↔</TableHead>
                                            <TableHead>レシピ名</TableHead>
                                            <TableHead className="text-right">レシピ販売価格</TableHead>
                                            <TableHead className="text-right">原価</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {linkedProducts.map(product => {
                                            const recipe = getRecipeForProduct(product.id);
                                            return (
                                                <TableRow key={product.id}>
                                                    <TableCell><CheckCircle2 className="w-4 h-4 text-purple-500" /></TableCell>
                                                    <TableCell className="font-medium">{product.name}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(product.price)}</TableCell>
                                                    <TableCell className="text-right">{product.profit_rate != null ? `${product.profit_rate}%` : "-"}</TableCell>
                                                    <TableCell className="text-center"><Link2 className="w-4 h-4 mx-auto text-purple-500" /></TableCell>
                                                    <TableCell className="font-medium text-purple-700">{recipe?.name || "（レシピ不明）"}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(recipe?.selling_price || null)}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(recipe?.total_cost ? Math.round(recipe.total_cost) : null)}</TableCell>
                                                    <TableCell>
                                                        {recipe && (
                                                            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => handleUnlink(recipe.id)}>
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
