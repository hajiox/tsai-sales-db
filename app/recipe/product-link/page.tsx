// app/recipe/product-link/page.tsx
// レシピ ↔ WEB販売商品 紐付け管理ページ
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
import { ArrowLeft, Link2, Unlink, RefreshCw, Search, Check, X, ArrowRight, AlertTriangle } from "lucide-react";
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

export default function ProductLinkPage() {
    const router = useRouter();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [searchRecipe, setSearchRecipe] = useState("");
    const [searchProduct, setSearchProduct] = useState("");
    const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
    const [linkingRecipeId, setLinkingRecipeId] = useState<string | null>(null);

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

    const handleLink = async (recipeId: string, productId: string) => {
        try {
            const res = await fetch("/api/recipe/sync-product", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipeId, productId }),
            });
            if (!res.ok) throw new Error("紐付けに失敗しました");
            toast.success("紐付けを設定しました");
            setLinkingRecipeId(null);
            fetchData();
        } catch (error: any) {
            toast.error(error.message);
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

    // Derived data
    const linkedProductIds = useMemo(
        () => new Set(recipes.filter((r) => r.linked_product_id).map((r) => r.linked_product_id!)),
        [recipes]
    );

    const linkedRecipes = recipes.filter((r) => r.linked_product_id);
    const unlinkedRecipes = recipes.filter(
        (r) => !r.linked_product_id && r.name.toLowerCase().includes(searchRecipe.toLowerCase())
    );
    const unlinkedProducts = products.filter(
        (p) => !linkedProductIds.has(p.id) && p.name.toLowerCase().includes(searchProduct.toLowerCase())
    );

    const getLinkedProduct = (productId: string) => products.find((p) => p.id === productId);

    const formatCurrency = (v: number | null) => (v ? `¥${v.toLocaleString()}` : "-");

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
                        レシピ（ネット専用）とWEB販売管理システムの商品を紐付けて、価格・利益率を自動同期します
                    </p>
                </div>
                <Button onClick={handleSyncAll} disabled={syncing} className="bg-green-600 hover:bg-green-700">
                    <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                    全件同期
                </Button>
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
                        <div className="text-2xl font-bold text-green-700">
                            {linkedRecipes.length}
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="pt-4 pb-3">
                        <div className="text-sm text-amber-700">未紐付け</div>
                        <div className="text-2xl font-bold text-amber-700">
                            {recipes.length - linkedRecipes.length}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Linked Recipes */}
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
                                    const product = getLinkedProduct(recipe.linked_product_id!);
                                    const priceMismatch = product && recipe.selling_price !== product.price;
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
                                                {product?.profit_rate != null
                                                    ? `${product.profit_rate}%`
                                                    : "-"}
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

            {/* Unlinked - Side by side */}
            <div className="grid grid-cols-2 gap-4">
                {/* Unlinked Recipes */}
                <Card className="border-amber-200">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            未紐付けレシピ（{unlinkedRecipes.length}件）
                        </CardTitle>
                        <div className="relative mt-2">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                                placeholder="レシピを検索..."
                                value={searchRecipe}
                                onChange={(e) => setSearchRecipe(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-[400px] overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>レシピ名</TableHead>
                                        <TableHead className="text-right">販売価格</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {unlinkedRecipes.map((recipe) => (
                                        <TableRow
                                            key={recipe.id}
                                            className={`cursor-pointer ${linkingRecipeId === recipe.id
                                                ? "bg-blue-50 border-blue-300"
                                                : "hover:bg-gray-50"
                                                }`}
                                            onClick={() =>
                                                setLinkingRecipeId(
                                                    linkingRecipeId === recipe.id ? null : recipe.id
                                                )
                                            }
                                        >
                                            <TableCell className="font-medium">{recipe.name}</TableCell>
                                            <TableCell className="text-right">
                                                {formatCurrency(recipe.selling_price)}
                                            </TableCell>
                                            <TableCell>
                                                {linkingRecipeId === recipe.id ? (
                                                    <span className="text-blue-500 text-xs flex items-center gap-1">
                                                        <ArrowRight className="w-3 h-3" />
                                                        選択中
                                                    </span>
                                                ) : (
                                                    <Button variant="ghost" size="sm" className="text-blue-400">
                                                        <Link2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {unlinkedRecipes.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center text-gray-400 py-4">
                                                未紐付けのレシピはありません
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Unlinked Products */}
                <Card className="border-amber-200">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            未紐付けWEB商品（{unlinkedProducts.length}件）
                        </CardTitle>
                        <div className="relative mt-2">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                                placeholder="商品を検索..."
                                value={searchProduct}
                                onChange={(e) => setSearchProduct(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-[400px] overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>商品名</TableHead>
                                        <TableHead className="text-right">価格</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {unlinkedProducts.map((product) => (
                                        <TableRow
                                            key={product.id}
                                            className={`${linkingRecipeId
                                                ? "cursor-pointer hover:bg-green-50"
                                                : "hover:bg-gray-50"
                                                }`}
                                            onClick={() => {
                                                if (linkingRecipeId) {
                                                    handleLink(linkingRecipeId, product.id);
                                                }
                                            }}
                                        >
                                            <TableCell className="font-medium">{product.name}</TableCell>
                                            <TableCell className="text-right">
                                                {formatCurrency(product.price)}
                                            </TableCell>
                                            <TableCell>
                                                {linkingRecipeId && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-green-500 hover:text-green-700"
                                                    >
                                                        <Link2 className="w-4 h-4" />
                                                        紐付け
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {unlinkedProducts.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center text-gray-400 py-4">
                                                未紐付けの商品はありません
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Linking hint */}
            {linkingRecipeId && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 z-50">
                    <Link2 className="w-5 h-5" />
                    <span>
                        「{recipes.find((r) => r.id === linkingRecipeId)?.name}」を紐付ける商品を右側から選択してください
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-white hover:bg-blue-500 ml-2"
                        onClick={() => setLinkingRecipeId(null)}
                    >
                        <X className="w-4 h-4" />
                        キャンセル
                    </Button>
                </div>
            )}
        </div>
    );
}
