"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    ArrowLeft,
    Camera,
    Package,
    FileText,
    Tag,
    FlaskConical,
    CheckCircle2,
    Loader2,
    Save,
    X,
    Plus,
    Search,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

interface Ingredient {
    id: string;
    name: string;
    unit_quantity: number | null;
    price: number | null;
    calories: number | null;
    protein: number | null;
    fat: number | null;
    carbohydrate: number | null;
    sodium: number | null;
    raw_materials: string | null;
    allergens: string | null;
    origin: string | null;
    manufacturer: string | null;
    product_description: string | null;
    nutrition_per: string | null;
}

type LabelType = "front_label" | "ingredients_label" | "nutrition_label";

interface LabelFile {
    type: LabelType;
    file: File;
    preview: string;
}

interface Candidate {
    id: string;
    name: string;
    confidence: number;
    reason: string;
    current_data: Ingredient | null;
}

interface ExtractedData {
    [key: string]: any;
}

const LABEL_CONFIG: Record<LabelType, { label: string; icon: any; color: string; colorBg: string; description: string }> = {
    front_label: {
        label: "表ラベル",
        icon: Tag,
        color: "text-blue-600",
        colorBg: "bg-blue-100",
        description: "商品名・内容量・メーカー名",
    },
    ingredients_label: {
        label: "原材料表示",
        icon: FileText,
        color: "text-amber-600",
        colorBg: "bg-amber-100",
        description: "原材料名・アレルゲン・産地",
    },
    nutrition_label: {
        label: "栄養成分表示",
        icon: FlaskConical,
        color: "text-green-600",
        colorBg: "bg-green-100",
        description: "カロリー・栄養素・食塩相当量",
    },
};

const FIELD_LABELS: Record<string, string> = {
    name: "商品名",
    product_description: "商品説明",
    unit_quantity: "内容量(g)",
    raw_materials: "原材料名",
    allergens: "アレルギー表示",
    origin: "原産国・産地",
    manufacturer: "製造者",
    nutrition_per: "栄養成分基準量",
    calories: "エネルギー(kcal)",
    protein: "たんぱく質(g)",
    fat: "脂質(g)",
    carbohydrate: "炭水化物(g)",
    sodium: "食塩相当量(g)",
};

type ActionMode = "select" | "update" | "create";

function LabelImportContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const preselectedId = searchParams.get("id");

    const [labelFiles, setLabelFiles] = useState<LabelFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [extracted, setExtracted] = useState<ExtractedData | null>(null);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [actionMode, setActionMode] = useState<ActionMode>("select");
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
    const [editedData, setEditedData] = useState<ExtractedData>({});
    const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [manualSearchTerm, setManualSearchTerm] = useState("");
    const [manualSearchResults, setManualSearchResults] = useState<Ingredient[]>([]);
    const [showManualSearch, setShowManualSearch] = useState(false);
    const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const manualSearchRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchAllIngredients();
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (manualSearchRef.current && !manualSearchRef.current.contains(e.target as Node)) {
                setShowManualSearch(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchAllIngredients = async () => {
        const { data } = await supabase
            .from("ingredients")
            .select("id, name, unit_quantity, price, calories, protein, fat, carbohydrate, sodium, raw_materials, allergens, origin, manufacturer, product_description, nutrition_per")
            .order("name");
        setAllIngredients(data || []);
    };

    const handleFileAdd = (type: LabelType, file: File) => {
        const preview = URL.createObjectURL(file);
        setLabelFiles((prev) => {
            const filtered = prev.filter((f) => f.type !== type);
            return [...filtered, { type, file, preview }];
        });
    };

    const handleFileRemove = (type: LabelType) => {
        setLabelFiles((prev) => {
            const removed = prev.find((f) => f.type === type);
            if (removed) URL.revokeObjectURL(removed.preview);
            return prev.filter((f) => f.type !== type);
        });
    };

    const handleAnalyze = async () => {
        if (!labelFiles.length) {
            toast.error("ラベル画像を1つ以上追加してください");
            return;
        }

        setLoading(true);
        setExtracted(null);
        setCandidates([]);
        setActionMode("select");
        setSelectedCandidate(null);
        setEditedData({});
        setSelectedFields({});

        try {
            const formData = new FormData();
            labelFiles.forEach((lf) => {
                formData.append("files", lf.file);
                formData.append("types", lf.type);
            });

            const res = await fetch("/api/label/analyze", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "解析に失敗しました");
            }

            const data = await res.json();
            setExtracted(data.extracted);
            setCandidates(data.candidates || []);

            // Initialize edited data
            const newEditedData: ExtractedData = {};
            for (const [key, value] of Object.entries(data.extracted)) {
                if (value !== null && value !== undefined && FIELD_LABELS[key]) {
                    newEditedData[key] = value;
                }
            }
            setEditedData(newEditedData);

            // If preselectedId provided, auto-select that candidate
            if (preselectedId) {
                const found = (data.candidates || []).find((c: Candidate) => c.id === preselectedId);
                if (found) {
                    selectCandidateForUpdate(found, newEditedData);
                }
            }

            toast.success("ラベル解析が完了しました");
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const selectCandidateForUpdate = (candidate: Candidate, dataToCompare?: ExtractedData) => {
        setSelectedCandidate(candidate);
        setActionMode("update");

        // Auto-select fields: check fields that are empty in DB or have different values
        const data = dataToCompare || editedData;
        const newSelectedFields: Record<string, boolean> = {};
        for (const key of Object.keys(data)) {
            // 更新モードではnameを自動選択しない（既存食材の名前を上書きしてしまうため）
            if (key === "name") {
                newSelectedFields[key] = false;
                continue;
            }
            const currentValue = candidate.current_data ? (candidate.current_data as any)[key] : null;
            const extractedValue = data[key];
            const isEmpty = currentValue === null || currentValue === undefined || currentValue === "";
            const isDifferent = !isEmpty && String(currentValue) !== String(extractedValue);
            // Auto-select fields that are empty in DB OR different from extracted
            newSelectedFields[key] = isEmpty || isDifferent;
        }
        setSelectedFields(newSelectedFields);
    };

    const selectManualIngredient = (ing: Ingredient) => {
        const candidate: Candidate = {
            id: ing.id,
            name: ing.name,
            confidence: 1.0,
            reason: "手動選択",
            current_data: ing,
        };
        selectCandidateForUpdate(candidate);
        setShowManualSearch(false);
        setManualSearchTerm("");
    };

    const switchToCreate = () => {
        setActionMode("create");
        setSelectedCandidate(null);
        // Select all fields for new entry
        const newSelectedFields: Record<string, boolean> = {};
        for (const key of Object.keys(editedData)) {
            newSelectedFields[key] = true;
        }
        setSelectedFields(newSelectedFields);
    };

    const handleSave = async () => {
        const updates: Record<string, any> = {};
        for (const [key, isSelected] of Object.entries(selectedFields)) {
            if (isSelected && editedData[key] !== undefined) {
                updates[key] = editedData[key];
            }
        }

        if (Object.keys(updates).length === 0) {
            toast.error("更新する項目を選択してください");
            return;
        }

        setIsSaving(true);
        try {
            if (actionMode === "update" && selectedCandidate) {
                // Update existing
                const res = await fetch("/api/label/update", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        target_id: selectedCandidate.id,
                        updates,
                    }),
                });

                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || "更新に失敗しました");
                }

                const result = await res.json();
                toast.success(`「${selectedCandidate.name}」の${result.updated_fields.length}件の項目を更新しました`);
            } else if (actionMode === "create") {
                // Create new ingredient
                const { data, error } = await supabase
                    .from("ingredients")
                    .insert([updates])
                    .select();

                if (error) throw new Error(error.message);
                toast.success(`「${updates.name || "新規食材"}」を新規登録しました`);
            }

            // Reset state
            await fetchAllIngredients();
            setExtracted(null);
            setCandidates([]);
            setEditedData({});
            setSelectedFields({});
            setActionMode("select");
            setSelectedCandidate(null);
            setLabelFiles([]);
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const selectAllFields = () => {
        const newSelected: Record<string, boolean> = {};
        for (const key of Object.keys(editedData)) {
            newSelected[key] = true;
        }
        setSelectedFields(newSelected);
    };

    const deselectAllFields = () => {
        const newSelected: Record<string, boolean> = {};
        for (const key of Object.keys(editedData)) {
            newSelected[key] = false;
        }
        setSelectedFields(newSelected);
    };

    const filteredManualSearch = allIngredients.filter((i) =>
        i.name.toLowerCase().includes(manualSearchTerm.toLowerCase())
    );

    const currentDbData = selectedCandidate?.current_data || null;

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => router.push("/recipe/database")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    戻る
                </Button>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">
                        ラベルAI解析・データ取込
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        食品ラベルの画像をAIで解析し、原材料・栄養成分を自動登録
                    </p>
                </div>
            </div>

            {/* Step 1: Upload Label Images */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold">
                            1
                        </div>
                        <h2 className="text-lg font-bold text-gray-900">ラベル画像をアップロード</h2>
                        <span className="text-xs text-gray-400">（1つ以上必須・同時に複数種類も可能）</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(Object.entries(LABEL_CONFIG) as [LabelType, typeof LABEL_CONFIG[LabelType]][]).map(
                            ([type, config]) => {
                                const existing = labelFiles.find((f) => f.type === type);
                                const Icon = config.icon;

                                return (
                                    <div
                                        key={type}
                                        className={`relative border-2 border-dashed rounded-xl p-4 transition-all ${existing
                                            ? "border-green-300 bg-green-50/50"
                                            : "border-gray-200 hover:border-gray-400 bg-gray-50/30"
                                            }`}
                                    >
                                        {existing && (
                                            <button
                                                onClick={() => handleFileRemove(type)}
                                                className="absolute top-2 right-2 p-1 bg-red-100 text-red-500 rounded-full hover:bg-red-200 z-10"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}

                                        <input
                                            ref={(el) => { fileInputRefs.current[type] = el; }}
                                            type="file"
                                            accept="image/*,application/pdf"
                                            className="hidden"
                                            onChange={(e) => {
                                                if (e.target.files?.[0]) {
                                                    handleFileAdd(type, e.target.files[0]);
                                                }
                                            }}
                                        />

                                        {existing ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                                    <span className="text-sm font-bold text-green-700">
                                                        {config.label}
                                                    </span>
                                                </div>
                                                {existing.file.type.startsWith("image/") && (
                                                    <img
                                                        src={existing.preview}
                                                        alt={config.label}
                                                        className="w-full h-32 object-contain rounded-lg bg-white border"
                                                    />
                                                )}
                                                <div className="text-xs text-gray-500 truncate">
                                                    {existing.file.name}
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full text-xs"
                                                    onClick={() => fileInputRefs.current[type]?.click()}
                                                >
                                                    変更
                                                </Button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => fileInputRefs.current[type]?.click()}
                                                className="w-full flex flex-col items-center gap-3 py-4 cursor-pointer"
                                            >
                                                <div className={`p-3 rounded-full ${config.colorBg}`}>
                                                    <Icon className={`w-6 h-6 ${config.color}`} />
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-sm font-bold text-gray-700">
                                                        {config.label}
                                                    </div>
                                                    <div className="text-xs text-gray-400 mt-0.5">
                                                        {config.description}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                                    <Camera className="w-3 h-3" />
                                                    クリックして画像を選択
                                                </div>
                                            </button>
                                        )}
                                    </div>
                                );
                            }
                        )}
                    </div>

                    <div className="flex justify-center mt-6">
                        <Button
                            onClick={handleAnalyze}
                            disabled={!labelFiles.length || loading}
                            size="lg"
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    AI解析中...
                                </>
                            ) : (
                                <>
                                    <FlaskConical className="w-5 h-5 mr-2" />
                                    AIで解析開始（{labelFiles.length}枚）
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Step 2: Match Candidates */}
            {extracted && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold">
                                2
                            </div>
                            <h2 className="text-lg font-bold text-gray-900">DB照合・対象選択</h2>
                            {extracted.name && (
                                <Badge variant="outline" className="text-sm">
                                    検出: {extracted.name}
                                </Badge>
                            )}
                        </div>

                        {/* AI Candidates */}
                        {candidates.length > 0 ? (
                            <div className="space-y-2 mb-4">
                                <p className="text-sm text-gray-600 mb-2">
                                    AIが既存DBから以下の候補を検出しました。更新する食材を選択してください：
                                </p>
                                {candidates.map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={() => selectCandidateForUpdate(c)}
                                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${selectedCandidate?.id === c.id && actionMode === "update"
                                            ? "border-blue-500 bg-blue-50"
                                            : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <Package className="w-5 h-5 text-gray-400" />
                                                <div>
                                                    <div className="font-bold text-gray-900">{c.name}</div>
                                                    <div className="text-xs text-gray-500 mt-0.5">
                                                        {c.reason}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge
                                                    className={
                                                        c.confidence >= 0.8
                                                            ? "bg-green-100 text-green-700"
                                                            : c.confidence >= 0.5
                                                                ? "bg-yellow-100 text-yellow-700"
                                                                : "bg-red-100 text-red-700"
                                                    }
                                                >
                                                    {Math.round(c.confidence * 100)}%
                                                </Badge>
                                                <Badge variant="outline" className="text-[10px]">
                                                    ID: {c.id.slice(-8)}
                                                </Badge>
                                            </div>
                                        </div>
                                        {c.current_data && (
                                            <div className="mt-2 grid grid-cols-3 md:grid-cols-5 gap-1 text-[10px] text-gray-400">
                                                <span>内容量: {c.current_data.unit_quantity ?? "-"}g</span>
                                                <span>kcal: {c.current_data.calories ?? "-"}</span>
                                                <span>原材料: {c.current_data.raw_materials ? "✅" : "❌"}</span>
                                                <span>栄養: {c.current_data.calories ? "✅" : "❌"}</span>
                                                <span>価格: ¥{c.current_data.price ?? "-"}</span>
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                                <p className="text-sm text-yellow-800">
                                    既存DBに一致する食材が見つかりませんでした。手動で検索するか、新規登録してください。
                                </p>
                            </div>
                        )}

                        {/* Manual Search */}
                        <div className="flex flex-wrap gap-3 items-start">
                            <div ref={manualSearchRef} className="relative flex-1 min-w-[200px]">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={manualSearchTerm}
                                        onChange={(e) => {
                                            setManualSearchTerm(e.target.value);
                                            setShowManualSearch(true);
                                        }}
                                        onFocus={() => { if (manualSearchTerm) setShowManualSearch(true); }}
                                        placeholder="手動で食材を検索..."
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                {showManualSearch && manualSearchTerm && (
                                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                        {filteredManualSearch.length > 0 ? (
                                            filteredManualSearch.slice(0, 15).map((ing) => (
                                                <button
                                                    key={ing.id}
                                                    onClick={() => selectManualIngredient(ing)}
                                                    className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0 text-sm"
                                                >
                                                    <div className="font-medium text-gray-900">{ing.name}</div>
                                                    <div className="text-[10px] text-gray-400">
                                                        原材料: {ing.raw_materials ? "✅" : "❌"} ・ 栄養: {ing.calories ? "✅" : "❌"}
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="px-4 py-2 text-sm text-gray-500">該当なし</div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <Button
                                onClick={switchToCreate}
                                variant={actionMode === "create" ? "default" : "outline"}
                                className={actionMode === "create" ? "bg-purple-600 hover:bg-purple-700" : "border-purple-300 text-purple-700 hover:bg-purple-50"}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                新規登録
                            </Button>
                        </div>

                        {/* Selected target display */}
                        {actionMode === "update" && selectedCandidate && (
                            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                                    <span className="text-sm font-bold text-blue-900">
                                        更新先: {selectedCandidate.name}
                                    </span>
                                    <Badge variant="outline" className="text-[10px]">
                                        ID: {selectedCandidate.id.slice(-8)}
                                    </Badge>
                                </div>
                            </div>
                        )}
                        {actionMode === "create" && (
                            <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                                <div className="flex items-center gap-2">
                                    <Plus className="w-4 h-4 text-purple-600" />
                                    <span className="text-sm font-bold text-purple-900">
                                        新規食材として登録します
                                    </span>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Review & Save Results */}
            {extracted && (actionMode === "update" || actionMode === "create") && Object.keys(editedData).length > 0 && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold">
                                    3
                                </div>
                                <h2 className="text-lg font-bold text-gray-900">解析結果の確認・保存</h2>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={selectAllFields}>
                                    全選択
                                </Button>
                                <Button variant="outline" size="sm" onClick={deselectAllFields}>
                                    全解除
                                </Button>
                            </div>
                        </div>

                        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="p-3 text-left w-12">適用</th>
                                        <th className="p-3 text-left w-40">項目</th>
                                        {actionMode === "update" && (
                                            <>
                                                <th className="p-3 text-left">現在のDB値</th>
                                                <th className="p-3 text-center w-8"></th>
                                            </>
                                        )}
                                        <th className="p-3 text-left">AI解析値（編集可能）</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {Object.entries(editedData).map(([key, value]) => {
                                        const currentValue = currentDbData
                                            ? (currentDbData as any)[key]
                                            : null;
                                        const isLongText = key === "raw_materials" || key === "product_description";
                                        const hasChanged = actionMode === "update" &&
                                            currentValue !== null && currentValue !== undefined &&
                                            String(currentValue) !== String(value);
                                        const isNewField = actionMode === "update" &&
                                            (currentValue === null || currentValue === undefined || currentValue === "");

                                        return (
                                            <tr
                                                key={key}
                                                className={`hover:bg-gray-50 transition ${selectedFields[key] ? "bg-blue-50/30" : "opacity-50"
                                                    }`}
                                            >
                                                <td className="p-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedFields[key] || false}
                                                        onChange={() =>
                                                            setSelectedFields((prev) => ({
                                                                ...prev,
                                                                [key]: !prev[key],
                                                            }))
                                                        }
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-medium text-gray-700">
                                                            {FIELD_LABELS[key] || key}
                                                        </span>
                                                        {isNewField && (
                                                            <Badge className="bg-green-100 text-green-700 text-[9px] px-1 py-0">NEW</Badge>
                                                        )}
                                                    </div>
                                                </td>
                                                {actionMode === "update" && (
                                                    <>
                                                        <td className="p-3 text-gray-500">
                                                            {isLongText ? (
                                                                <div className="max-w-[200px] line-clamp-2 text-xs" title={String(currentValue || "")}>
                                                                    {currentValue || <span className="text-gray-300 italic">未登録</span>}
                                                                </div>
                                                            ) : (
                                                                currentValue ?? <span className="text-gray-300 italic">未登録</span>
                                                            )}
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            {hasChanged ? (
                                                                <span className="text-orange-500 text-xs font-bold">→</span>
                                                            ) : isNewField ? (
                                                                <span className="text-green-500 text-xs font-bold">+</span>
                                                            ) : (
                                                                <span className="text-gray-300 text-xs">＝</span>
                                                            )}
                                                        </td>
                                                    </>
                                                )}
                                                <td className="p-3">
                                                    {isLongText ? (
                                                        <textarea
                                                            value={String(value || "")}
                                                            onChange={(e) =>
                                                                setEditedData((prev) => ({
                                                                    ...prev,
                                                                    [key]: e.target.value,
                                                                }))
                                                            }
                                                            rows={3}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                                                        />
                                                    ) : (
                                                        <input
                                                            type={typeof value === "number" ? "number" : "text"}
                                                            value={String(value ?? "")}
                                                            onChange={(e) =>
                                                                setEditedData((prev) => ({
                                                                    ...prev,
                                                                    [key]:
                                                                        typeof value === "number"
                                                                            ? parseFloat(e.target.value) || 0
                                                                            : e.target.value,
                                                                }))
                                                            }
                                                            step={typeof value === "number" ? "0.01" : undefined}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                        />
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end mt-4 gap-3">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setExtracted(null);
                                    setCandidates([]);
                                    setEditedData({});
                                    setSelectedFields({});
                                    setActionMode("select");
                                    setSelectedCandidate(null);
                                }}
                            >
                                クリア
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={
                                    isSaving ||
                                    !Object.values(selectedFields).some(Boolean)
                                }
                                className={
                                    actionMode === "create"
                                        ? "bg-purple-600 hover:bg-purple-700 text-white"
                                        : "bg-green-600 hover:bg-green-700 text-white"
                                }
                            >
                                {isSaving ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <Save className="w-4 h-4 mr-2" />
                                )}
                                {actionMode === "create"
                                    ? "新規登録"
                                    : `「${selectedCandidate?.name}」を更新`}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

export default function LabelImportPage() {
    return (
        <Suspense fallback={<div className="max-w-6xl mx-auto p-6">読み込み中...</div>}>
            <LabelImportContent />
        </Suspense>
    );
}
