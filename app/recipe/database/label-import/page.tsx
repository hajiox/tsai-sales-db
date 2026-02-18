"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    ArrowLeft,
    Upload,
    Camera,
    Package,
    FileText,
    Tag,
    FlaskConical,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Save,
    X,
    Search,
    ChevronDown,
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
    salt: number | null;
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
    sodium: "ナトリウム(mg)",
    salt: "食塩相当量(g)",
};

function LabelImportContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const preselectedId = searchParams.get("id");

    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);
    const [labelFiles, setLabelFiles] = useState<LabelFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [extracted, setExtracted] = useState<ExtractedData | null>(null);
    const [editedData, setEditedData] = useState<ExtractedData>({});
    const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});
    const [isSaving, setIsSaving] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    useEffect(() => {
        fetchIngredients();
    }, []);

    useEffect(() => {
        if (preselectedId && ingredients.length > 0) {
            const found = ingredients.find((i) => i.id === preselectedId);
            if (found) {
                setSelectedIngredient(found);
                setSearchTerm(found.name);
            }
        }
    }, [preselectedId, ingredients]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchIngredients = async () => {
        const { data } = await supabase
            .from("ingredients")
            .select("id, name, unit_quantity, price, calories, protein, fat, carbohydrate, sodium, salt, raw_materials, allergens, origin, manufacturer, product_description, nutrition_per")
            .order("name");
        setIngredients(data || []);
    };

    const filteredIngredients = ingredients.filter((i) =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
        setEditedData({});
        setSelectedFields({});

        try {
            const formData = new FormData();
            labelFiles.forEach((lf) => {
                formData.append("files", lf.file);
                formData.append("types", lf.type);
            });
            if (selectedIngredient) {
                formData.append("target_id", selectedIngredient.id);
                formData.append("target_name", selectedIngredient.name);
            }

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

            // Initialize edited data and auto-select fields that have new values
            const newEditedData: ExtractedData = {};
            const newSelectedFields: Record<string, boolean> = {};

            for (const [key, value] of Object.entries(data.extracted)) {
                if (value !== null && value !== undefined && FIELD_LABELS[key]) {
                    newEditedData[key] = value;
                    // Auto-select if the field is currently empty in DB
                    const currentValue = selectedIngredient
                        ? (selectedIngredient as any)[key]
                        : null;
                    newSelectedFields[key] = currentValue === null || currentValue === undefined || currentValue === "";
                }
            }

            setEditedData(newEditedData);
            setSelectedFields(newSelectedFields);
            toast.success("ラベル解析が完了しました");
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedIngredient) {
            toast.error("対象食材を選択してください");
            return;
        }

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
            const res = await fetch("/api/label/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    target_id: selectedIngredient.id,
                    updates,
                }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "更新に失敗しました");
            }

            const result = await res.json();
            toast.success(`${result.updated_fields.length}件の項目を更新しました`);

            // Refresh ingredient data
            await fetchIngredients();
            setExtracted(null);
            setEditedData({});
            setSelectedFields({});
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

            {/* Step 1: Select Ingredient */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold">
                            1
                        </div>
                        <h2 className="text-lg font-bold text-gray-900">対象食材を選択</h2>
                        <span className="text-xs text-gray-400">（任意：新規データとして解析も可能）</span>
                    </div>

                    <div ref={dropdownRef} className="relative max-w-md">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setShowDropdown(true);
                                    if (!e.target.value) setSelectedIngredient(null);
                                }}
                                onFocus={() => setShowDropdown(true)}
                                placeholder="食材名を検索..."
                                className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                            {selectedIngredient && (
                                <button
                                    onClick={() => {
                                        setSelectedIngredient(null);
                                        setSearchTerm("");
                                    }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {showDropdown && searchTerm && !selectedIngredient && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                {filteredIngredients.length > 0 ? (
                                    filteredIngredients.slice(0, 20).map((ing) => (
                                        <button
                                            key={ing.id}
                                            onClick={() => {
                                                setSelectedIngredient(ing);
                                                setSearchTerm(ing.name);
                                                setShowDropdown(false);
                                            }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-100 last:border-0 text-sm"
                                        >
                                            <div className="font-medium text-gray-900">{ing.name}</div>
                                            <div className="text-xs text-gray-400 mt-0.5">
                                                {ing.raw_materials ? "原材料登録済" : "原材料未登録"} ・
                                                {ing.calories ? "栄養成分登録済" : "栄養成分未登録"}
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="px-4 py-3 text-sm text-gray-500">
                                        一致する食材がありません
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {selectedIngredient && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-blue-600" />
                                <span className="font-bold text-blue-900">{selectedIngredient.name}</span>
                                <Badge variant="outline" className="text-[10px]">
                                    ID: {selectedIngredient.id.slice(-8)}
                                </Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs text-gray-600">
                                <span>内容量: {selectedIngredient.unit_quantity ?? "-"}g</span>
                                <span>カロリー: {selectedIngredient.calories ?? "-"}kcal</span>
                                <span>原材料: {selectedIngredient.raw_materials ? "✅登録済" : "❌未登録"}</span>
                                <span>栄養: {selectedIngredient.calories ? "✅登録済" : "❌未登録"}</span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Step 2: Upload Label Images */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold">
                            2
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

            {/* Step 3: Review & Save Results */}
            {extracted && Object.keys(editedData).length > 0 && (
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
                                        <th className="p-3 text-left">現在のDB値</th>
                                        <th className="p-3 text-center w-8"></th>
                                        <th className="p-3 text-left">AI解析値（編集可能）</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {Object.entries(editedData).map(([key, value]) => {
                                        const currentValue = selectedIngredient
                                            ? (selectedIngredient as any)[key]
                                            : null;
                                        const isLongText = key === "raw_materials" || key === "product_description";
                                        const hasChanged = currentValue !== null && currentValue !== undefined && String(currentValue) !== String(value);

                                        return (
                                            <tr
                                                key={key}
                                                className={`hover:bg-gray-50 transition ${selectedFields[key] ? "bg-blue-50/30" : "opacity-60"
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
                                                    <span className="font-medium text-gray-700">
                                                        {FIELD_LABELS[key] || key}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-gray-500">
                                                    {isLongText ? (
                                                        <div className="max-w-xs truncate text-xs" title={String(currentValue || "")}>
                                                            {currentValue || <span className="text-gray-300">未登録</span>}
                                                        </div>
                                                    ) : (
                                                        currentValue ?? <span className="text-gray-300">未登録</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {hasChanged ? (
                                                        <span className="text-orange-500 text-xs font-bold">→</span>
                                                    ) : (
                                                        <span className="text-green-500 text-xs">＝</span>
                                                    )}
                                                </td>
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
                                    setEditedData({});
                                    setSelectedFields({});
                                }}
                            >
                                クリア
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={
                                    isSaving ||
                                    !selectedIngredient ||
                                    !Object.values(selectedFields).some(Boolean)
                                }
                                className="bg-green-600 hover:bg-green-700 text-white"
                            >
                                {isSaving ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <Save className="w-4 h-4 mr-2" />
                                )}
                                選択した項目をDBに保存
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
