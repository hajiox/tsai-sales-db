// app/recipe/estimates/page.tsx
// 見積書データ確認ページ - Doc Scanner連携

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, X, Plus, RefreshCw, FileText, ChevronDown, ChevronRight, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface PendingEstimateItem {
    id: string;
    doc_scanner_doc_id: string;
    counterparty_name: string | null;
    doc_date: string | null;
    doc_number: string | null;
    total_amount: number | null;
    item_name: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    amount: number | null;
    tax_rate: number | null;
    matched_ingredient_id: string | null;
    matched_ingredient_name: string | null;
    match_confidence: number | null;
    status: string;
    applied_action: string | null;
    applied_at: string | null;
    notes: string | null;
    created_at: string;
}

interface ExistingIngredient {
    id: string;
    name: string;
    price: number | null;
    unit_quantity: number;
    type?: string; // "ingredient" | "material"
}

interface EstimateGroup {
    docId: string;
    counterpartyName: string;
    docDate: string | null;
    docNumber: string | null;
    totalAmount: number | null;
    createdAt: string;
    items: PendingEstimateItem[];
}

type StatusFilter = "pending" | "applied" | "rejected" | "all";

// --- 材料選択ドロップダウン ---
function IngredientSelector({
    itemId,
    itemName,
    matchedId,
    matchedName,
    ingredients,
    selectedId,
    onSelect,
}: {
    itemId: string;
    itemName: string;
    matchedId: string | null;
    matchedName: string | null;
    ingredients: ExistingIngredient[];
    selectedId: string | undefined;
    onSelect: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});

    // 外側クリックで閉じる
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // ドロップダウン位置を計算
    useEffect(() => {
        if (open && inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const dropH = 260;
            if (spaceBelow < dropH) {
                // 上方向に開く
                setDropStyle({ position: "fixed", left: rect.left, bottom: window.innerHeight - rect.top + 4, width: 480 });
            } else {
                // 下方向に開く
                setDropStyle({ position: "fixed", left: rect.left, top: rect.bottom + 4, width: 480 });
            }
        }
    }, [open]);

    // 品目名から資材っぽいかを推定
    const materialKeywords = ["段ボール", "ダンボール", "箱", "ボール", "パック", "袋", "ラベル", "シール", "テープ", "ギフト", "発送用", "ネコポス", "レトルト用", "個入"];
    const isItemMaterial = materialKeywords.some(kw => itemName.includes(kw));

    // 品目名からキーワードを抽出（数字・記号・先頭の"1 "を除去して分割）
    const cleanName = itemName.replace(/^[\d\s]+/, "").replace(/[（）()]/g, "");
    const nameTokens = cleanName.split(/[\s　・×]+/).filter(t => t.length >= 2);

    // 各マスター項目の関連度スコアを計算
    const calcRelevance = (ingName: string): number => {
        const lower = ingName.toLowerCase();
        let score = 0;
        for (const token of nameTokens) {
            if (lower.includes(token.toLowerCase())) {
                score += token.length; // マッチした文字数をスコアに
            }
        }
        // 品目名全体が含まれるなら大ボーナス
        if (lower.includes(cleanName.toLowerCase()) || cleanName.toLowerCase().includes(lower.replace(/【.*?】/g, ""))) {
            score += 50;
        }
        return score;
    };

    const filtered = ingredients
        .filter(ing => {
            if (!search) return true;
            const s = search.toLowerCase();
            return ing.name.toLowerCase().includes(s);
        })
        .map(ing => ({ ...ing, relevance: calcRelevance(ing.name) }))
        .sort((a, b) => {
            // 推奨マッチを最優先
            if (a.id === matchedId) return -1;
            if (b.id === matchedId) return 1;
            // 関連度スコアが高い順
            if (a.relevance !== b.relevance) return b.relevance - a.relevance;
            // 品目名に基づいて同じtypeを優先
            const preferredType = isItemMaterial ? "material" : "ingredient";
            const aMatch = a.type === preferredType ? 0 : 1;
            const bMatch = b.type === preferredType ? 0 : 1;
            if (aMatch !== bMatch) return aMatch - bMatch;
            // 同じtype内は名前順
            return a.name.localeCompare(b.name, "ja");
        });

    const selectedIng = selectedId ? ingredients.find(i => i.id === selectedId) : null;
    const formatPrice = (v: number | null) => v != null ? `¥${Math.round(v).toLocaleString()}` : "";

    return (
        <div ref={ref} className="relative mt-2">
            {/* 選択済み表示 or 検索フィールド */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 shrink-0">既存材料:</span>
                {selectedIng ? (
                    <div className="flex items-center gap-1">
                        <span className="text-xs px-2 py-1 rounded border border-blue-400 bg-blue-50 text-blue-700">
                            {selectedIng.name} {selectedIng.price != null && <span className="text-blue-400">({formatPrice(selectedIng.price)})</span>}
                        </span>
                        <button onClick={() => { onSelect(""); setOpen(false); }} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                    </div>
                ) : (
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-300" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="材料名で検索..."
                            value={search}
                            onChange={e => { setSearch(e.target.value); setOpen(true); }}
                            onFocus={() => setOpen(true)}
                            className="h-7 text-xs pl-7 pr-2 w-56 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                    </div>
                )}
            </div>

            {/* ドロップダウン候補リスト */}
            {open && !selectedIng && (
                <div style={dropStyle} className="z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {/* 自動マッチ候補 */}
                    {matchedId && matchedName && (
                        <button
                            onClick={() => { onSelect(matchedId); setOpen(false); setSearch(""); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50 border-b border-gray-100 bg-green-50"
                        >
                            <span className="text-green-600">⭐ 推奨:</span>
                            <span className="font-medium">{matchedName}</span>
                        </button>
                    )}

                    {filtered.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-gray-400 text-center">
                            一致する材料がありません
                        </div>
                    ) : (
                        filtered.slice(0, 30).map(ing => (
                            <button
                                key={ing.id}
                                onClick={() => { onSelect(ing.id); setOpen(false); setSearch(""); }}
                                className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-blue-50 transition ${ing.id === matchedId ? "bg-green-50" : ""}`}
                            >
                                <span className="font-medium text-gray-800 truncate flex items-center gap-1">
                                    <span className={`text-[10px] px-1 py-0.5 rounded ${ing.type === "material" ? "bg-orange-100 text-orange-600" : "bg-emerald-100 text-emerald-600"}`}>
                                        {ing.type === "material" ? "📦資材" : "🥕食材"}
                                    </span>
                                    {ing.name}
                                </span>
                                <span className="text-gray-400 shrink-0 ml-2">
                                    {ing.price != null && formatPrice(ing.price)}
                                </span>
                            </button>
                        ))
                    )}
                    {filtered.length > 30 && (
                        <div className="px-3 py-2 text-[10px] text-gray-400 text-center border-t">
                            他 {filtered.length - 30}件（検索で絞り込み）
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// --- メインページ ---
export default function EstimatesPage() {
    const router = useRouter();
    const [items, setItems] = useState<PendingEstimateItem[]>([]);
    const [ingredients, setIngredients] = useState<ExistingIngredient[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [selectedIngredient, setSelectedIngredient] = useState<Record<string, string>>({});
    const [aiMatching, setAiMatching] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const res = await fetch(`/api/recipe/estimates?status=${statusFilter === "all" ? "pending" : statusFilter}`);
        if (res.ok) {
            const data = await res.json();
            setItems(data.items || []);
            setIngredients(data.ingredients || []);
        }
        setLoading(false);
    }, [statusFilter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        const groups = new Set(items.map(i => i.doc_scanner_doc_id));
        setExpandedGroups(groups);
    }, [items]);

    // グループ化
    const groups: EstimateGroup[] = [];
    const groupMap = new Map<string, PendingEstimateItem[]>();
    items.forEach(item => {
        const key = item.doc_scanner_doc_id;
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(item);
    });
    groupMap.forEach((groupItems, docId) => {
        const first = groupItems[0];
        groups.push({
            docId,
            counterpartyName: first.counterparty_name || "不明",
            docDate: first.doc_date,
            docNumber: first.doc_number,
            totalAmount: first.total_amount,
            createdAt: first.created_at,
            items: groupItems,
        });
    });

    const toggleGroup = (docId: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId); else next.add(docId);
            return next;
        });
    };

    // AIマッチング実行（手動）
    const handleRunAiMatch = async () => {
        const unmatchedCount = items.filter(i => i.status === "pending" && !i.matched_ingredient_id).length;
        if (unmatchedCount === 0) {
            toast.info("未マッチの品目はありません");
            return;
        }
        setAiMatching(true);
        try {
            const res = await fetch("/api/recipe/estimates", { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || `${data.matched}件マッチ完了`);
                fetchData(); // マッチ結果反映のため再取得
            } else {
                toast.error(data.error || "マッチングエラー");
            }
        } catch (e: any) { toast.error(e.message); }
        setAiMatching(false);
    };

    const handleUpdatePrice = async (item: PendingEstimateItem, ingredientId: string) => {
        setProcessing(item.id);
        try {
            const selectedIng = ingredients.find(i => i.id === ingredientId);
            const targetTable = selectedIng?.type === "material" ? "material" : "ingredient";
            const res = await fetch("/api/recipe/estimates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "update_price", itemId: item.id, ingredientId, targetTable }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success(`${item.item_name} → 価格更新完了`);
            // 楽観更新: リストから除去
            setItems(prev => prev.filter(i => i.id !== item.id));
        } catch (e: any) { toast.error(e.message); }
        setProcessing(null);
    };

    const handleCreateNew = async (item: PendingEstimateItem) => {
        setProcessing(item.id);
        try {
            const materialKeywords = ["段ボール", "ダンボール", "箱", "ボール", "パック", "袋", "ラベル", "シール", "テープ", "ギフト", "発送用", "ネコポス", "レトルト用"];
            const isMaterial = materialKeywords.some(kw => item.item_name.includes(kw));
            const targetTable = isMaterial ? "material" : "ingredient";
            const res = await fetch("/api/recipe/estimates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "create_new",
                    itemId: item.id,
                    targetTable,
                    newIngredientData: { name: item.item_name, unit_quantity: item.quantity || 1 },
                }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success(`${item.item_name} → ${isMaterial ? "資材DB" : "食材DB"}に新規登録完了`);
            // 楽観更新
            setItems(prev => prev.filter(i => i.id !== item.id));
        } catch (e: any) { toast.error(e.message); }
        setProcessing(null);
    };

    const handleSkip = async (item: PendingEstimateItem) => {
        // 楽観更新: 即座にリストから除去
        setItems(prev => prev.filter(i => i.id !== item.id));
        try {
            const res = await fetch("/api/recipe/estimates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "skip", itemId: item.id }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.info(`${item.item_name} → スキップ`);
        } catch (e: any) {
            toast.error(e.message);
            fetchData(); // エラー時のみ再取得
        }
    };

    const handleSkipGroup = async (group: EstimateGroup) => {
        const pendingInGroup = group.items.filter(i => i.status === "pending");
        if (pendingInGroup.length === 0) return;
        const skipIds = pendingInGroup.map(i => i.id);
        // 楽観更新
        const skipSet = new Set(skipIds);
        setItems(prev => prev.filter(i => !skipSet.has(i.id)));
        try {
            const res = await fetch("/api/recipe/estimates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "bulk_skip", itemIds: skipIds }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.info(`${group.counterpartyName} の見積書をスキップしました（${pendingInGroup.length}品目）`);
        } catch (e: any) {
            toast.error("スキップに失敗しました");
            fetchData();
        }
    };

    const handleSkipAll = async () => {
        const pendingItems = items.filter(i => i.status === "pending");
        if (pendingItems.length === 0) return;
        if (!confirm(`${pendingItems.length}件すべてをスキップしますか？`)) return;
        const skipIds = pendingItems.map(i => i.id);
        // 楽観更新
        const skipSet = new Set(skipIds);
        setItems(prev => prev.filter(i => !skipSet.has(i.id)));
        try {
            const res = await fetch("/api/recipe/estimates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "bulk_skip", itemIds: skipIds }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.info(`${pendingItems.length}件をスキップしました`);
        } catch (e: any) {
            toast.error("スキップに失敗しました");
            fetchData();
        }
    };

    const formatPrice = (v: number | null) => v != null ? `¥${Math.round(v).toLocaleString()}` : "-";
    const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("ja-JP") : "-";
    const pendingCount = items.filter(i => i.status === "pending").length;

    return (
        <div className="h-full flex flex-col p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.push("/recipe")}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        戻る
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <FileText className="w-6 h-6" />
                            見積書データ連携
                        </h1>
                        <p className="text-gray-600 text-sm">Doc Scannerから受信した見積書の明細を確認・材料マスターに反映</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {pendingCount > 0 && items.some(i => i.status === "pending" && !i.matched_ingredient_id) && (
                        <Button
                            variant="outline" size="sm"
                            onClick={handleRunAiMatch}
                            disabled={aiMatching}
                            className="text-purple-600 border-purple-300 hover:bg-purple-50"
                        >
                            <Sparkles className={`w-3 h-3 mr-1 ${aiMatching ? "animate-spin" : ""}`} />
                            {aiMatching ? "マッチング中..." : "AIマッチング実行"}
                        </Button>
                    )}
                    {pendingCount > 0 && (
                        <Button variant="outline" size="sm" onClick={handleSkipAll} className="text-gray-500">
                            <X className="w-3 h-3 mr-1" />
                            全件スキップ
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={fetchData}>
                        <RefreshCw className="w-3 h-3 mr-1" />
                        更新
                    </Button>
                </div>
            </div>

            {/* Status Filter */}
            <div className="flex gap-2 mb-4">
                {([
                    { key: "pending", label: "未処理", color: "bg-amber-100 text-amber-800" },
                    { key: "applied", label: "適用済み", color: "bg-green-100 text-green-800" },
                    { key: "rejected", label: "却下/スキップ", color: "bg-gray-100 text-gray-600" },
                ] as { key: StatusFilter; label: string; color: string }[]).map(f => (
                    <button
                        key={f.key}
                        onClick={() => setStatusFilter(f.key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${statusFilter === f.key ? f.color + " ring-2 ring-offset-1 ring-current" : "bg-gray-50 text-gray-400 hover:bg-gray-100"}`}
                    >
                        {f.label}
                        {f.key === "pending" && pendingCount > 0 && (
                            <span className="ml-1.5 bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[10px]">{pendingCount}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="text-center py-16 text-gray-400">読み込み中...</div>
                ) : groups.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>{statusFilter === "pending" ? "未処理の見積もりデータはありません" : "該当するデータがありません"}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {groups.map(group => (
                            <div key={group.docId} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                {/* グループヘッダー */}
                                <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
                                    <button
                                        onClick={() => toggleGroup(group.docId)}
                                        className="flex items-center gap-3 hover:opacity-70 transition"
                                    >
                                        {expandedGroups.has(group.docId) ?
                                            <ChevronDown className="w-4 h-4 text-gray-400" /> :
                                            <ChevronRight className="w-4 h-4 text-gray-400" />}
                                        <div className="text-left">
                                            <div className="font-semibold text-gray-900">
                                                📋 {group.counterpartyName}
                                                {group.docNumber && <span className="text-gray-500 font-normal ml-2">({group.docNumber})</span>}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {formatDate(group.docDate)} ・ {group.items.length}品目
                                                {group.totalAmount != null && ` ・ 合計 ${formatPrice(group.totalAmount)}`}
                                            </div>
                                        </div>
                                    </button>
                                    <div className="flex items-center gap-3">
                                        {statusFilter === "pending" && group.items.some(i => i.status === "pending") && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => { e.stopPropagation(); handleSkipGroup(group); }}
                                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 text-xs"
                                            >
                                                <X className="w-3 h-3 mr-1" />
                                                この見積をスキップ
                                            </Button>
                                        )}
                                        <span className="text-xs text-gray-400">
                                            受信: {new Date(group.createdAt).toLocaleString("ja-JP")}
                                        </span>
                                    </div>
                                </div>

                                {/* グループ内容 */}
                                {expandedGroups.has(group.docId) && (
                                    <div className="divide-y divide-gray-100">
                                        {group.items.map(item => (
                                            <div key={item.id} className={`px-5 py-3 ${processing === item.id ? "opacity-50" : ""}`}>
                                                <div className="flex items-start justify-between gap-4">
                                                    {/* 明細情報 */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-medium text-gray-900">{item.item_name}</span>
                                                            {item.match_confidence != null && item.match_confidence > 0 && (
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${item.match_confidence >= 0.8
                                                                    ? "bg-green-100 text-green-700"
                                                                    : item.match_confidence >= 0.5
                                                                        ? "bg-yellow-100 text-yellow-700"
                                                                        : "bg-gray-100 text-gray-500"
                                                                    }`}>
                                                                    マッチ {Math.round(item.match_confidence * 100)}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-4 text-sm text-gray-500">
                                                            {item.quantity != null && <span>数量: {item.quantity}{item.unit || "個"}</span>}
                                                            {item.unit_price != null && (
                                                                <span>
                                                                    単価: {formatPrice(item.unit_price)}
                                                                    <span className="text-[10px] text-gray-400 ml-0.5">(税別)</span>
                                                                    <span className="text-[10px] text-blue-500 ml-1">
                                                                        →税込{formatPrice(Math.round(item.unit_price * (1 + (item.tax_rate || 0.1)) * 100) / 100)}
                                                                    </span>
                                                                </span>
                                                            )}
                                                            {item.amount != null && <span className="font-medium text-gray-700">金額: {formatPrice(item.amount)}</span>}
                                                        </div>

                                                        {/* 材料選択（pending時のみ） */}
                                                        {item.status === "pending" && (
                                                            <IngredientSelector
                                                                itemId={item.id}
                                                                itemName={item.item_name}
                                                                matchedId={item.matched_ingredient_id}
                                                                matchedName={item.matched_ingredient_name}
                                                                ingredients={ingredients}
                                                                selectedId={selectedIngredient[item.id]}
                                                                onSelect={(id) => setSelectedIngredient(p => ({ ...p, [item.id]: id }))}
                                                            />
                                                        )}

                                                        {/* 適用済み/スキップ済み表示 */}
                                                        {item.status === "applied" && (
                                                            <div className="mt-1 text-xs text-green-600">
                                                                ✓ {item.applied_action === "price_updated" ? "価格更新済み" : "新規登録済み"}
                                                                {item.applied_at && ` (${new Date(item.applied_at).toLocaleString("ja-JP")})`}
                                                            </div>
                                                        )}
                                                        {(item.status === "rejected" || item.status === "skipped") && (
                                                            <div className="mt-1 text-xs text-gray-400">✕ スキップ済み</div>
                                                        )}
                                                    </div>

                                                    {/* アクションボタン */}
                                                    {item.status === "pending" && (
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            {selectedIngredient[item.id] && (
                                                                <Button
                                                                    size="sm" variant="outline"
                                                                    className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                                                                    onClick={() => handleUpdatePrice(item, selectedIngredient[item.id])}
                                                                    disabled={processing === item.id}
                                                                >
                                                                    <Check className="w-3 h-3 mr-1" />
                                                                    価格更新
                                                                </Button>
                                                            )}
                                                            <Button
                                                                size="sm" variant="outline"
                                                                className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                                                                onClick={() => handleCreateNew(item)}
                                                                disabled={processing === item.id}
                                                            >
                                                                <Plus className="w-3 h-3 mr-1" />
                                                                新規登録
                                                            </Button>
                                                            <Button
                                                                size="sm" variant="ghost"
                                                                className="h-7 text-xs text-gray-400 hover:text-red-500"
                                                                onClick={() => handleSkip(item)}
                                                                disabled={processing === item.id}
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
