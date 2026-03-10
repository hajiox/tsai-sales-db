// app/recipe/estimates/page.tsx
// 見積書データ確認ページ - Doc Scanner連携

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, X, Plus, RefreshCw, FileText, ChevronDown, ChevronRight, Search } from "lucide-react";
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
    price_excl_tax: number | null;
    supplier: string | null;
    unit_quantity: number;
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

    // 外側クリックで閉じる
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const filtered = ingredients.filter(ing => {
        if (!search) return true;
        const s = search.toLowerCase();
        return ing.name.toLowerCase().includes(s) || (ing.supplier || "").toLowerCase().includes(s);
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
                <div className="absolute z-50 left-16 top-8 w-80 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
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
                                <span className="font-medium text-gray-800 truncate">{ing.name}</span>
                                <span className="text-gray-400 shrink-0 ml-2">
                                    {ing.price != null && formatPrice(ing.price)}
                                    {ing.supplier && ` / ${ing.supplier}`}
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

    const handleUpdatePrice = async (item: PendingEstimateItem, ingredientId: string) => {
        setProcessing(item.id);
        try {
            const res = await fetch("/api/recipe/estimates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "update_price", itemId: item.id, ingredientId }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success(`${item.item_name} → 価格更新完了`);
            fetchData();
        } catch (e: any) { toast.error(e.message); }
        setProcessing(null);
    };

    const handleCreateNew = async (item: PendingEstimateItem) => {
        setProcessing(item.id);
        try {
            const res = await fetch("/api/recipe/estimates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "create_new",
                    itemId: item.id,
                    newIngredientData: { name: item.item_name, unit_quantity: item.quantity || 1 },
                }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.success(`${item.item_name} → 新規登録完了`);
            fetchData();
        } catch (e: any) { toast.error(e.message); }
        setProcessing(null);
    };

    const handleSkip = async (item: PendingEstimateItem) => {
        setProcessing(item.id);
        try {
            const res = await fetch("/api/recipe/estimates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "skip", itemId: item.id }),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            toast.info(`${item.item_name} → スキップ`);
            fetchData();
        } catch (e: any) { toast.error(e.message); }
        setProcessing(null);
    };

    const handleSkipAll = async () => {
        const pendingItems = items.filter(i => i.status === "pending");
        if (pendingItems.length === 0) return;
        if (!confirm(`${pendingItems.length}件すべてをスキップしますか？`)) return;
        for (const item of pendingItems) {
            await fetch("/api/recipe/estimates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "skip", itemId: item.id }),
            });
        }
        toast.info(`${pendingItems.length}件をスキップしました`);
        fetchData();
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
                                <button
                                    onClick={() => toggleGroup(group.docId)}
                                    className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition"
                                >
                                    <div className="flex items-center gap-3">
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
                                    </div>
                                    <div className="text-xs text-gray-400">
                                        受信: {new Date(group.createdAt).toLocaleString("ja-JP")}
                                    </div>
                                </button>

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
                                                            {item.quantity != null && <span>数量: {item.quantity}{item.unit || ""}</span>}
                                                            {item.unit_price != null && <span>単価: {formatPrice(item.unit_price)}</span>}
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
