// app/recipe/duplicates/page.tsx
// レシピ重複検出・統合管理ページ
"use client";

import { useEffect, useState } from "react";
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
    ArrowLeft,
    Trash2,
    Merge,
    Sparkles,
    AlertTriangle,
    Check,
    Link2,
    Package,
    Star,
    X,
} from "lucide-react";
import { toast } from "sonner";

interface DuplicateMember {
    id: string;
    name: string;
    category: string;
    linked_product_id: string | null;
    selling_price: number | null;
    total_cost: number | null;
    source_file: string | null;
    series: string | null;
    series_code: number | null;
    product_code: number | null;
    item_count: number;
    created_at: string | null;
}

interface DuplicateGroup {
    normalizedName: string;
    keepId: string;
    members: DuplicateMember[];
}

export default function DuplicatesPage() {
    const router = useRouter();
    const [groups, setGroups] = useState<DuplicateGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalDuplicates, setTotalDuplicates] = useState(0);
    const [processing, setProcessing] = useState(false);
    // Track which recipe to keep per group
    const [keepSelections, setKeepSelections] = useState<Record<string, string>>({});

    useEffect(() => {
        fetchDuplicates();
    }, []);

    const fetchDuplicates = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/recipe/duplicates");
            if (!res.ok) throw new Error("取得に失敗しました");
            const data = await res.json();
            setGroups(data.groups || []);
            setTotalDuplicates(data.totalDuplicates || 0);
            // Initialize keep selections
            const selections: Record<string, string> = {};
            for (const g of data.groups || []) {
                selections[g.normalizedName] = g.keepId;
            }
            setKeepSelections(selections);
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteOne = async (recipeId: string, recipeName: string) => {
        if (!confirm(`「${recipeName}」を削除しますか？\n材料データも一緒に削除されます。`)) return;
        try {
            const res = await fetch("/api/recipe/duplicates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "delete_one", recipeId }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "削除に失敗しました");
            }
            toast.success(`「${recipeName}」を削除しました`);
            fetchDuplicates();
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleMergeGroup = async (group: DuplicateGroup) => {
        const keepId = keepSelections[group.normalizedName] || group.keepId;
        const keepRecipe = group.members.find((m) => m.id === keepId);
        const deleteIds = group.members.filter((m) => m.id !== keepId).map((m) => m.id);

        if (deleteIds.length === 0) return;

        if (
            !confirm(
                `「${keepRecipe?.name}」を残し、他${deleteIds.length}件を統合・削除しますか？\n有用データ（紐付け・シリーズ・価格）は保持レシピに移植されます。`
            )
        )
            return;

        try {
            const res = await fetch("/api/recipe/duplicates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "merge_group", keepId, deleteIds }),
            });
            if (!res.ok) throw new Error("統合に失敗しました");
            const data = await res.json();
            toast.success(`${data.deleted}件を統合・削除しました`);
            fetchDuplicates();
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleAutoCleanup = async () => {
        if (
            !confirm(
                `全${groups.length}グループ（${totalDuplicates}件の重複）を一括統合しますか？\n\n各グループで最も条件の良いレシピ（紐付済み > 材料数多 > 価格あり > 古い方）を残し、他を削除します。\n有用データは保持レシピに自動移植されます。\n\nこの操作は取り消せません。`
            )
        )
            return;

        setProcessing(true);
        try {
            const res = await fetch("/api/recipe/duplicates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "auto_cleanup" }),
            });
            if (!res.ok) throw new Error("統合に失敗しました");
            const data = await res.json();
            toast.success(`${data.deleted}件の重複レシピを統合・削除しました`);
            fetchDuplicates();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setProcessing(false);
        }
    };

    const changeKeep = (groupKey: string, recipeId: string) => {
        setKeepSelections((prev) => ({ ...prev, [groupKey]: recipeId }));
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
                        <Merge className="w-7 h-7" />
                        レシピ重複チェック・統合
                    </h1>
                    <p className="text-gray-500 mt-1">
                        同名・類似名のレシピを検出し、統合・削除を管理します
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={fetchDuplicates}
                    >
                        再スキャン
                    </Button>
                    {groups.length > 0 && (
                        <Button
                            onClick={handleAutoCleanup}
                            disabled={processing}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            <Sparkles className={`w-4 h-4 mr-2 ${processing ? "animate-spin" : ""}`} />
                            {processing ? "処理中..." : `全${totalDuplicates}件を一括統合`}
                        </Button>
                    )}
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-sm text-gray-500">重複グループ数</div>
                        <div className="text-2xl font-bold">{groups.length}</div>
                    </CardContent>
                </Card>
                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="pt-4 pb-3">
                        <div className="text-sm text-amber-700">削除対象レシピ数</div>
                        <div className="text-2xl font-bold text-amber-700">{totalDuplicates}</div>
                    </CardContent>
                </Card>
                <Card className={groups.length === 0 ? "border-green-200 bg-green-50" : ""}>
                    <CardContent className="pt-4 pb-3">
                        <div className={`text-sm ${groups.length === 0 ? "text-green-700" : "text-gray-500"}`}>
                            状態
                        </div>
                        <div className={`text-lg font-bold ${groups.length === 0 ? "text-green-700" : "text-gray-700"}`}>
                            {groups.length === 0 ? "✓ 重複なし" : `${groups.length}件の重複あり`}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Groups */}
            {groups.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-gray-400">
                        <Check className="w-12 h-12 mx-auto mb-4 text-green-400" />
                        <p className="text-lg">重複レシピはありません。</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {groups.map((group, gi) => {
                        const keepId = keepSelections[group.normalizedName] || group.keepId;
                        return (
                            <Card key={group.normalizedName} className="border-amber-200">
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                                            <span className="text-gray-500">#{gi + 1}</span>
                                            重複: {group.members[0].name}
                                            <span className="text-sm text-gray-400">
                                                ({group.members.length}件)
                                            </span>
                                        </CardTitle>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="border-red-300 text-red-700 hover:bg-red-50"
                                            onClick={() => handleMergeGroup(group)}
                                        >
                                            <Merge className="w-3 h-3 mr-1" />
                                            このグループを統合
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[60px]">残す</TableHead>
                                                <TableHead>レシピ名</TableHead>
                                                <TableHead>カテゴリ</TableHead>
                                                <TableHead className="text-center">紐付</TableHead>
                                                <TableHead className="text-center">材料数</TableHead>
                                                <TableHead className="text-right">販売価格</TableHead>
                                                <TableHead>シリーズ</TableHead>
                                                <TableHead className="text-xs">ソース</TableHead>
                                                <TableHead></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {group.members.map((m) => {
                                                const isKeep = m.id === keepId;
                                                return (
                                                    <TableRow
                                                        key={m.id}
                                                        className={
                                                            isKeep
                                                                ? "bg-green-50/70 border-l-4 border-l-green-500"
                                                                : "bg-red-50/30 border-l-4 border-l-red-300"
                                                        }
                                                    >
                                                        <TableCell>
                                                            <button
                                                                onClick={() =>
                                                                    changeKeep(group.normalizedName, m.id)
                                                                }
                                                                className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition ${isKeep
                                                                        ? "bg-green-500 border-green-500 text-white"
                                                                        : "border-gray-300 hover:border-green-400"
                                                                    }`}
                                                            >
                                                                {isKeep && <Star className="w-3 h-3" />}
                                                            </button>
                                                        </TableCell>
                                                        <TableCell className="font-medium text-sm">
                                                            <div className="flex items-center gap-1">
                                                                {m.name}
                                                                {isKeep && (
                                                                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-bold">
                                                                        残す
                                                                    </span>
                                                                )}
                                                                {!isKeep && (
                                                                    <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px]">
                                                                        削除
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="px-2 py-0.5 rounded text-xs bg-gray-100">
                                                                {m.category}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {m.linked_product_id ? (
                                                                <Link2 className="w-4 h-4 text-green-500 mx-auto" />
                                                            ) : (
                                                                <span className="text-gray-300">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <span
                                                                className={`text-sm ${m.item_count > 0
                                                                        ? "font-medium"
                                                                        : "text-gray-300"
                                                                    }`}
                                                            >
                                                                {m.item_count || "-"}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right text-sm">
                                                            {m.selling_price
                                                                ? `¥${m.selling_price.toLocaleString()}`
                                                                : "-"}
                                                        </TableCell>
                                                        <TableCell className="text-xs text-gray-500">
                                                            {m.series || "-"}
                                                        </TableCell>
                                                        <TableCell className="text-xs text-gray-400 max-w-[120px] truncate">
                                                            {m.source_file
                                                                ?.replace(
                                                                    "【重要】【製造】総合管理（新型）",
                                                                    ""
                                                                )
                                                                .replace(".xlsx", "") || "-"}
                                                        </TableCell>
                                                        <TableCell>
                                                            {!isKeep && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                                                                    onClick={() =>
                                                                        handleDeleteOne(m.id, m.name)
                                                                    }
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
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
                        );
                    })}
                </div>
            )}
        </div>
    );
}
