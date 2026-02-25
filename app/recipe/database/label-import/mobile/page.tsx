"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ─── Types ───
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

type ActionMode = "select" | "update" | "create";

// ─── Constants ───
const LABEL_CONFIG: Record<LabelType, { label: string; emoji: string; color: string; bg: string; description: string }> = {
    front_label: {
        label: "表ラベル",
        emoji: "🏷️",
        color: "#2563eb",
        bg: "#dbeafe",
        description: "商品名・内容量",
    },
    ingredients_label: {
        label: "原材料表示",
        emoji: "📋",
        color: "#d97706",
        bg: "#fef3c7",
        description: "原材料名・アレルゲン",
    },
    nutrition_label: {
        label: "栄養成分",
        emoji: "🧪",
        color: "#16a34a",
        bg: "#dcfce7",
        description: "カロリー・栄養素",
    },
};

const FIELD_LABELS: Record<string, string> = {
    name: "商品名",
    product_description: "商品説明",
    unit_quantity: "内容量(g)",
    raw_materials: "原材料名",
    allergens: "アレルギー",
    origin: "原産国・産地",
    manufacturer: "製造者",
    nutrition_per: "栄養基準量",
    calories: "kcal",
    protein: "たんぱく質",
    fat: "脂質",
    carbohydrate: "炭水化物",
    sodium: "食塩相当量",
};

// ─── Main Component ───
function MobileLabelImportContent() {
    const searchParams = useSearchParams();
    const preselectedId = searchParams.get("id");

    // Steps: 1=Upload, 2=Analyzing, 3=SelectTarget, 4=Review, 5=Done
    const [step, setStep] = useState(1);
    const [labelFiles, setLabelFiles] = useState<LabelFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [extracted, setExtracted] = useState<ExtractedData | null>(null);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [actionMode, setActionMode] = useState<ActionMode>("select");
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
    const [editedData, setEditedData] = useState<ExtractedData>({});
    const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [showSearch, setShowSearch] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    useEffect(() => {
        fetchAllIngredients();
    }, []);

    // Set viewport meta for proper mobile rendering
    useEffect(() => {
        let metaViewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
        if (!metaViewport) {
            metaViewport = document.createElement('meta');
            metaViewport.name = 'viewport';
            document.head.appendChild(metaViewport);
        }
        metaViewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
    }, []);

    // Auto-hide toast
    useEffect(() => {
        if (toastMsg) {
            const t = setTimeout(() => setToastMsg(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toastMsg]);

    const fetchAllIngredients = async () => {
        const { data } = await supabase
            .from("ingredients")
            .select("id, name, unit_quantity, price, calories, protein, fat, carbohydrate, sodium, raw_materials, allergens, origin, manufacturer, product_description, nutrition_per")
            .order("name");
        setAllIngredients(data || []);
    };

    const showToast = (text: string, type: "success" | "error") => {
        setToastMsg({ text, type });
    };

    // ─── Image Compression (for Vercel 4.5MB body limit) ───
    const compressImage = (file: File, maxWidth = 1200, quality = 0.7): Promise<{ base64: string; mimeType: string }> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width;
                let h = img.height;
                if (w > maxWidth) {
                    h = Math.round((h * maxWidth) / w);
                    w = maxWidth;
                }
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (!ctx) { reject(new Error("Canvas not supported")); return; }
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL("image/jpeg", quality);
                const base64 = dataUrl.split(",")[1] || "";
                resolve({ base64, mimeType: "image/jpeg" });
            };
            img.onerror = () => reject(new Error("画像の読み込みに失敗"));
            img.src = URL.createObjectURL(file);
        });
    };

    // ─── File Handling ───
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

    // ─── Analyze ───
    const handleAnalyze = async () => {
        if (!labelFiles.length) {
            showToast("ラベル画像を1つ以上追加してください", "error");
            return;
        }

        setLoading(true);
        setStep(2);
        setExtracted(null);
        setCandidates([]);
        setActionMode("select");
        setSelectedCandidate(null);
        setEditedData({});
        setSelectedFields({});

        try {
            // Step A: Compress and convert files to Base64
            let fileData: { base64: string; mimeType: string; type: string }[];
            try {
                fileData = await Promise.all(
                    labelFiles.map(async (lf) => {
                        const compressed = await compressImage(lf.file);
                        return { ...compressed, type: lf.type };
                    })
                );
            } catch (e: any) {
                throw new Error("画像変換エラー: " + (e.message || e));
            }

            // Step B: Send request
            let res: Response;
            try {
                res = await fetch("/api/label/analyze", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ files: fileData }),
                });
            } catch (e: any) {
                throw new Error("通信エラー: " + (e.message || e));
            }

            // Step C: Parse response
            if (!res.ok) {
                let errMsg = "解析に失敗しました";
                try {
                    const errData = await res.json();
                    errMsg = errData.error || errMsg;
                } catch { }
                throw new Error("API Error (" + res.status + "): " + errMsg);
            }

            const data = await res.json();
            setExtracted(data.extracted);
            setCandidates(data.candidates || []);

            const newEditedData: ExtractedData = {};
            for (const [key, value] of Object.entries(data.extracted)) {
                if (value !== null && value !== undefined && FIELD_LABELS[key]) {
                    newEditedData[key] = value;
                }
            }
            setEditedData(newEditedData);

            if (preselectedId) {
                const found = (data.candidates || []).find((c: Candidate) => c.id === preselectedId);
                if (found) {
                    selectCandidateForUpdate(found, newEditedData);
                    setStep(4);
                    showToast("解析完了・対象を自動選択しました", "success");
                    return;
                }
            }

            setStep(3);
            showToast("ラベル解析が完了しました", "success");
        } catch (error: any) {
            showToast(error.message || "不明なエラー", "error");
            setStep(1);
        } finally {
            setLoading(false);
        }
    };

    // ─── Candidate Selection ───
    const selectCandidateForUpdate = (candidate: Candidate, dataToCompare?: ExtractedData) => {
        setSelectedCandidate(candidate);
        setActionMode("update");

        const data = dataToCompare || editedData;
        const newSelectedFields: Record<string, boolean> = {};
        for (const key of Object.keys(data)) {
            if (key === "name") {
                newSelectedFields[key] = false;
                continue;
            }
            const currentValue = candidate.current_data ? (candidate.current_data as any)[key] : null;
            const extractedValue = data[key];
            const isEmpty = currentValue === null || currentValue === undefined || currentValue === "";
            const isDifferent = !isEmpty && String(currentValue) !== String(extractedValue);
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
        setShowSearch(false);
        setSearchTerm("");
        setStep(4);
    };

    const switchToCreate = () => {
        setActionMode("create");
        setSelectedCandidate(null);
        const newSelectedFields: Record<string, boolean> = {};
        for (const key of Object.keys(editedData)) {
            newSelectedFields[key] = true;
        }
        setSelectedFields(newSelectedFields);
        setStep(4);
    };

    // ─── Save ───
    const handleSave = async () => {
        const updates: Record<string, any> = {};
        for (const [key, isSelected] of Object.entries(selectedFields)) {
            if (isSelected && editedData[key] !== undefined) {
                updates[key] = editedData[key];
            }
        }

        if (Object.keys(updates).length === 0) {
            showToast("更新する項目を選択してください", "error");
            return;
        }

        setIsSaving(true);
        try {
            if (actionMode === "update" && selectedCandidate) {
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
                showToast(`「${selectedCandidate.name}」を更新しました`, "success");
            } else if (actionMode === "create") {
                const { data, error } = await supabase
                    .from("ingredients")
                    .insert([updates])
                    .select();

                if (error) throw new Error(error.message);
                showToast(`「${updates.name || "新規食材"}」を登録しました`, "success");
            }

            setStep(5);
        } catch (error: any) {
            showToast(error.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Reset ───
    const handleReset = async () => {
        await fetchAllIngredients();
        setStep(1);
        setExtracted(null);
        setCandidates([]);
        setEditedData({});
        setSelectedFields({});
        setActionMode("select");
        setSelectedCandidate(null);
        // Don't clear labelFiles so user can keep images for next scan
    };

    const handleFullReset = () => {
        labelFiles.forEach(f => URL.revokeObjectURL(f.preview));
        setLabelFiles([]);
        handleReset();
    };

    const filteredSearch = allIngredients.filter((i) =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const currentDbData = selectedCandidate?.current_data || null;
    const uploadedCount = labelFiles.length;

    // ─── Render ───
    return (
        <div style={{
            minHeight: "100vh",
            background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
            paddingBottom: "env(safe-area-inset-bottom, 20px)",
        }}>
            {/* Toast */}
            {toastMsg && (
                <div style={{
                    position: "fixed",
                    top: 16,
                    left: 16,
                    right: 16,
                    zIndex: 100,
                    padding: "14px 18px",
                    borderRadius: 14,
                    background: toastMsg.type === "success" ? "#059669" : "#dc2626",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 600,
                    textAlign: "center",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
                    animation: "slideDown 0.3s ease-out",
                }}>
                    {toastMsg.type === "success" ? "✅ " : "❌ "}{toastMsg.text}
                </div>
            )}

            {/* Header */}
            <div style={{
                background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
                padding: "16px 20px",
                paddingTop: "max(16px, env(safe-area-inset-top))",
                color: "#fff",
            }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>📷 ラベルAI取込</div>
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>食品ラベルを撮影してDBに自動登録 <span style={{ opacity: 0.5 }}>v2</span></div>
                    </div>
                    <div style={{
                        fontSize: 12,
                        background: "rgba(255,255,255,0.15)",
                        padding: "4px 12px",
                        borderRadius: 20,
                        fontWeight: 600,
                    }}>
                        STEP {step > 5 ? 5 : step}/5
                    </div>
                </div>

                {/* Progress bar */}
                <div style={{
                    marginTop: 12,
                    height: 4,
                    borderRadius: 2,
                    background: "rgba(255,255,255,0.15)",
                    overflow: "hidden",
                }}>
                    <div style={{
                        height: "100%",
                        width: `${(Math.min(step, 5) / 5) * 100}%`,
                        background: "linear-gradient(90deg, #60a5fa, #34d399)",
                        borderRadius: 2,
                        transition: "width 0.4s ease",
                    }} />
                </div>
            </div>

            <div style={{ padding: "16px 16px 40px" }}>

                {/* ════════════════════════════════════════ */}
                {/* STEP 1: Upload */}
                {/* ════════════════════════════════════════ */}
                {step === 1 && (
                    <div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", marginBottom: 16 }}>
                            ラベル画像を撮影・選択
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {(Object.entries(LABEL_CONFIG) as [LabelType, typeof LABEL_CONFIG[LabelType]][]).map(
                                ([type, config]) => {
                                    const existing = labelFiles.find((f) => f.type === type);
                                    return (
                                        <div key={type}>
                                            <input
                                                ref={(el) => { fileInputRefs.current[type] = el; }}
                                                type="file"
                                                accept="image/*"
                                                style={{ display: "none" }}
                                                onChange={(e) => {
                                                    if (e.target.files?.[0]) {
                                                        handleFileAdd(type, e.target.files[0]);
                                                        e.target.value = "";
                                                    }
                                                }}
                                            />

                                            {existing ? (
                                                <div style={{
                                                    border: "2px solid #86efac",
                                                    borderRadius: 16,
                                                    background: "#f0fdf4",
                                                    overflow: "hidden",
                                                }}>
                                                    {/* Preview */}
                                                    <div style={{ position: "relative" }}>
                                                        {existing.file.type.startsWith("image/") && (
                                                            <img
                                                                src={existing.preview}
                                                                alt={config.label}
                                                                style={{
                                                                    width: "100%",
                                                                    height: 140,
                                                                    objectFit: "contain",
                                                                    background: "#fff",
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                    <div style={{
                                                        padding: "10px 14px",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                    }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                            <span style={{ fontSize: 22 }}>✅</span>
                                                            <div>
                                                                <div style={{ fontSize: 14, fontWeight: 700, color: "#166534" }}>
                                                                    {config.label}
                                                                </div>
                                                                <div style={{ fontSize: 11, color: "#4ade80" }}>撮影済み</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: "flex", gap: 8 }}>
                                                            <button
                                                                onClick={() => fileInputRefs.current[type]?.click()}
                                                                style={{
                                                                    padding: "8px 14px",
                                                                    borderRadius: 10,
                                                                    border: "1px solid #86efac",
                                                                    background: "#fff",
                                                                    color: "#166534",
                                                                    fontSize: 13,
                                                                    fontWeight: 600,
                                                                    cursor: "pointer",
                                                                }}
                                                            >
                                                                📷変更
                                                            </button>
                                                            <button
                                                                onClick={() => handleFileRemove(type)}
                                                                style={{
                                                                    padding: "8px 14px",
                                                                    borderRadius: 10,
                                                                    border: "1px solid #fca5a5",
                                                                    background: "#fef2f2",
                                                                    color: "#dc2626",
                                                                    fontSize: 13,
                                                                    fontWeight: 600,
                                                                    cursor: "pointer",
                                                                }}
                                                            >
                                                                🗑 取消
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => fileInputRefs.current[type]?.click()}
                                                    style={{
                                                        width: "100%",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 14,
                                                        padding: "18px 16px",
                                                        borderRadius: 16,
                                                        border: "2px dashed #cbd5e1",
                                                        background: "#fff",
                                                        cursor: "pointer",
                                                        textAlign: "left",
                                                    }}
                                                >
                                                    <div style={{
                                                        width: 52,
                                                        height: 52,
                                                        borderRadius: 14,
                                                        background: config.bg,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        fontSize: 26,
                                                        flexShrink: 0,
                                                    }}>
                                                        {config.emoji}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                                                            {config.label}
                                                        </div>
                                                        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                                                            {config.description}
                                                        </div>
                                                    </div>
                                                    <div style={{
                                                        fontSize: 12,
                                                        color: config.color,
                                                        fontWeight: 600,
                                                        flexShrink: 0,
                                                    }}>
                                                        📷 撮影/選択
                                                    </div>
                                                </button>
                                            )}
                                        </div>
                                    );
                                }
                            )}
                        </div>

                        {/* Analyze button */}
                        <button
                            onClick={handleAnalyze}
                            disabled={!uploadedCount}
                            style={{
                                width: "100%",
                                marginTop: 24,
                                padding: "18px",
                                borderRadius: 16,
                                border: "none",
                                background: uploadedCount
                                    ? "linear-gradient(135deg, #2563eb, #7c3aed)"
                                    : "#e2e8f0",
                                color: uploadedCount ? "#fff" : "#94a3b8",
                                fontSize: 17,
                                fontWeight: 700,
                                cursor: uploadedCount ? "pointer" : "not-allowed",
                                boxShadow: uploadedCount ? "0 4px 20px rgba(37,99,235,0.3)" : "none",
                                transition: "all 0.2s",
                            }}
                        >
                            🔬 AIで解析開始（{uploadedCount}枚）
                        </button>

                        <div style={{
                            marginTop: 12,
                            textAlign: "center",
                            fontSize: 12,
                            color: "#94a3b8",
                        }}>
                            ※ 1枚以上の画像で解析可能です
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════ */}
                {/* STEP 2: Analyzing */}
                {/* ════════════════════════════════════════ */}
                {step === 2 && (
                    <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "50vh",
                        gap: 20,
                    }}>
                        <div style={{
                            width: 80,
                            height: 80,
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #dbeafe, #ede9fe)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 40,
                            animation: "pulse 1.5s infinite",
                        }}>
                            🔬
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#1e293b" }}>
                            AI 解析中...
                        </div>
                        <div style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}>
                            ラベル画像を読み取り、商品情報を<br />抽出しています
                        </div>
                        <div style={{
                            width: 200,
                            height: 6,
                            borderRadius: 3,
                            background: "#e2e8f0",
                            overflow: "hidden",
                        }}>
                            <div style={{
                                height: "100%",
                                background: "linear-gradient(90deg, #2563eb, #7c3aed)",
                                borderRadius: 3,
                                animation: "loading 1.5s ease-in-out infinite",
                            }} />
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════ */}
                {/* STEP 3: Select Target */}
                {/* ════════════════════════════════════════ */}
                {step === 3 && extracted && (
                    <div>
                        {/* Detected Name */}
                        {extracted.name && (
                            <div style={{
                                padding: "12px 16px",
                                borderRadius: 14,
                                background: "linear-gradient(135deg, #dbeafe, #e0e7ff)",
                                marginBottom: 16,
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                            }}>
                                <span style={{ fontSize: 22 }}>🔍</span>
                                <div>
                                    <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600 }}>検出された商品名</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>{extracted.name}</div>
                                </div>
                            </div>
                        )}

                        <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
                            更新先を選択
                        </div>
                        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                            既存食材を更新 or 新規登録を選択してください
                        </div>

                        {/* AI Candidates */}
                        {candidates.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 8 }}>
                                    💡 AI候補 ({candidates.length}件)
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {candidates.map((c) => (
                                        <button
                                            key={c.id}
                                            onClick={() => {
                                                selectCandidateForUpdate(c);
                                                setStep(4);
                                            }}
                                            style={{
                                                width: "100%",
                                                textAlign: "left",
                                                padding: "14px 16px",
                                                borderRadius: 14,
                                                border: "2px solid #e2e8f0",
                                                background: "#fff",
                                                cursor: "pointer",
                                            }}
                                        >
                                            <div style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                            }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                                                        {c.name}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                                                        {c.reason}
                                                    </div>
                                                </div>
                                                <div style={{
                                                    padding: "4px 10px",
                                                    borderRadius: 20,
                                                    fontSize: 13,
                                                    fontWeight: 700,
                                                    background: c.confidence >= 0.8 ? "#dcfce7" : c.confidence >= 0.5 ? "#fef9c3" : "#fee2e2",
                                                    color: c.confidence >= 0.8 ? "#166534" : c.confidence >= 0.5 ? "#854d0e" : "#991b1b",
                                                }}>
                                                    {Math.round(c.confidence * 100)}%
                                                </div>
                                            </div>
                                            {c.current_data && (
                                                <div style={{
                                                    marginTop: 8,
                                                    display: "flex",
                                                    flexWrap: "wrap",
                                                    gap: 8,
                                                    fontSize: 11,
                                                    color: "#94a3b8",
                                                }}>
                                                    <span>内容量: {c.current_data.unit_quantity ?? "-"}g</span>
                                                    <span>原材料: {c.current_data.raw_materials ? "✅" : "❌"}</span>
                                                    <span>栄養: {c.current_data.calories ? "✅" : "❌"}</span>
                                                    <span>¥{c.current_data.price ?? "-"}</span>
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {candidates.length === 0 && (
                            <div style={{
                                padding: "14px 16px",
                                borderRadius: 14,
                                background: "#fefce8",
                                border: "1px solid #fde68a",
                                marginBottom: 16,
                                fontSize: 13,
                                color: "#854d0e",
                            }}>
                                ⚠️ 既存DBに一致する食材が見つかりませんでした
                            </div>
                        )}

                        {/* Manual search */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 8 }}>
                                🔎 手動で検索
                            </div>
                            <div style={{ position: "relative" }}>
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setShowSearch(true);
                                    }}
                                    onFocus={() => { if (searchTerm) setShowSearch(true); }}
                                    placeholder="食材名を入力..."
                                    style={{
                                        width: "100%",
                                        padding: "14px 16px",
                                        borderRadius: 14,
                                        border: "2px solid #e2e8f0",
                                        fontSize: 15,
                                        outline: "none",
                                        boxSizing: "border-box",
                                    }}
                                />
                                {showSearch && searchTerm && (
                                    <div style={{
                                        position: "absolute",
                                        top: "100%",
                                        left: 0,
                                        right: 0,
                                        marginTop: 4,
                                        background: "#fff",
                                        border: "1px solid #e2e8f0",
                                        borderRadius: 14,
                                        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                                        maxHeight: 280,
                                        overflowY: "auto",
                                        zIndex: 50,
                                    }}>
                                        {filteredSearch.length > 0 ? (
                                            filteredSearch.slice(0, 20).map((ing) => (
                                                <button
                                                    key={ing.id}
                                                    onClick={() => selectManualIngredient(ing)}
                                                    style={{
                                                        width: "100%",
                                                        textAlign: "left",
                                                        padding: "12px 16px",
                                                        borderBottom: "1px solid #f1f5f9",
                                                        background: "none",
                                                        border: "none",
                                                        borderBottomWidth: 1,
                                                        borderBottomStyle: "solid",
                                                        borderBottomColor: "#f1f5f9",
                                                        cursor: "pointer",
                                                        fontSize: 14,
                                                    }}
                                                >
                                                    <div style={{ fontWeight: 600, color: "#1e293b" }}>{ing.name}</div>
                                                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                                                        原材料: {ing.raw_materials ? "✅" : "❌"} ・ 栄養: {ing.calories ? "✅" : "❌"}
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div style={{ padding: "14px 16px", fontSize: 13, color: "#94a3b8" }}>
                                                該当する食材がありません
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* New registration */}
                        <button
                            onClick={switchToCreate}
                            style={{
                                width: "100%",
                                padding: "16px",
                                borderRadius: 14,
                                border: "2px solid #c084fc",
                                background: "linear-gradient(135deg, #faf5ff, #f3e8ff)",
                                color: "#7c3aed",
                                fontSize: 15,
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            ➕ 新規食材として登録
                        </button>

                        {/* Back */}
                        <button
                            onClick={() => setStep(1)}
                            style={{
                                width: "100%",
                                marginTop: 12,
                                padding: "14px",
                                borderRadius: 14,
                                border: "none",
                                background: "transparent",
                                color: "#64748b",
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >
                            ← ラベル画像を変更
                        </button>

                        <button
                            onClick={() => {
                                setStep(1);
                                setLabelFiles([]);
                                setExtracted(null);
                                setCandidates([]);
                                setActionMode("select");
                                setSelectedCandidate(null);
                                setEditedData({});
                                setSelectedFields({});
                                setSearchTerm("");
                                setShowSearch(false);
                            }}
                            style={{
                                width: "100%",
                                marginTop: 4,
                                padding: "14px",
                                borderRadius: 14,
                                border: "1px solid #fca5a5",
                                background: "#fef2f2",
                                color: "#dc2626",
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >
                            ✕ キャンセル（最初に戻る）
                        </button>
                    </div>
                )}

                {/* ════════════════════════════════════════ */}
                {/* STEP 4: Review & Save */}
                {/* ════════════════════════════════════════ */}
                {step === 4 && (
                    <div>
                        {/* Target info */}
                        {actionMode === "update" && selectedCandidate && (
                            <div style={{
                                padding: "12px 16px",
                                borderRadius: 14,
                                background: "linear-gradient(135deg, #dbeafe, #e0e7ff)",
                                marginBottom: 16,
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                            }}>
                                <span style={{ fontSize: 22 }}>📝</span>
                                <div>
                                    <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600 }}>更新先</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                                        {selectedCandidate.name}
                                    </div>
                                </div>
                            </div>
                        )}
                        {actionMode === "create" && (
                            <div style={{
                                padding: "12px 16px",
                                borderRadius: 14,
                                background: "linear-gradient(135deg, #faf5ff, #f3e8ff)",
                                marginBottom: 16,
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                            }}>
                                <span style={{ fontSize: 22 }}>✨</span>
                                <div>
                                    <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>モード</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                                        新規食材として登録
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 12,
                        }}>
                            <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b" }}>
                                解析結果の確認
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button
                                    onClick={() => {
                                        const s: Record<string, boolean> = {};
                                        for (const key of Object.keys(editedData)) s[key] = true;
                                        setSelectedFields(s);
                                    }}
                                    style={{
                                        padding: "6px 12px",
                                        borderRadius: 8,
                                        border: "1px solid #e2e8f0",
                                        background: "#fff",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: "#475569",
                                        cursor: "pointer",
                                    }}
                                >
                                    全選択
                                </button>
                                <button
                                    onClick={() => {
                                        const s: Record<string, boolean> = {};
                                        for (const key of Object.keys(editedData)) s[key] = false;
                                        setSelectedFields(s);
                                    }}
                                    style={{
                                        padding: "6px 12px",
                                        borderRadius: 8,
                                        border: "1px solid #e2e8f0",
                                        background: "#fff",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: "#475569",
                                        cursor: "pointer",
                                    }}
                                >
                                    全解除
                                </button>
                            </div>
                        </div>

                        {/* Fields */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                            {Object.entries(editedData).map(([key, value]) => {
                                const currentValue = currentDbData ? (currentDbData as any)[key] : null;
                                const isLongText = key === "raw_materials" || key === "product_description";
                                const isSelected = selectedFields[key] || false;
                                const isNewField = actionMode === "update" &&
                                    (currentValue === null || currentValue === undefined || currentValue === "");
                                const hasChanged = actionMode === "update" &&
                                    currentValue !== null && currentValue !== undefined &&
                                    String(currentValue) !== String(value);

                                return (
                                    <div
                                        key={key}
                                        style={{
                                            borderRadius: 14,
                                            border: `2px solid ${isSelected ? "#93c5fd" : "#e2e8f0"}`,
                                            background: isSelected ? "#eff6ff" : "#fff",
                                            overflow: "hidden",
                                            transition: "all 0.2s",
                                            opacity: isSelected ? 1 : 0.55,
                                        }}
                                    >
                                        {/* Field header */}
                                        <button
                                            onClick={() => setSelectedFields(prev => ({ ...prev, [key]: !prev[key] }))}
                                            style={{
                                                width: "100%",
                                                display: "flex",
                                                alignItems: "center",
                                                padding: "12px 14px",
                                                background: "none",
                                                border: "none",
                                                cursor: "pointer",
                                                gap: 10,
                                                textAlign: "left",
                                            }}
                                        >
                                            <div style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: 7,
                                                border: `2px solid ${isSelected ? "#3b82f6" : "#cbd5e1"}`,
                                                background: isSelected ? "#3b82f6" : "#fff",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexShrink: 0,
                                                transition: "all 0.2s",
                                            }}>
                                                {isSelected && (
                                                    <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>✓</span>
                                                )}
                                            </div>

                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 6,
                                                }}>
                                                    <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                                                        {FIELD_LABELS[key] || key}
                                                    </span>
                                                    {isNewField && (
                                                        <span style={{
                                                            fontSize: 10,
                                                            fontWeight: 700,
                                                            padding: "1px 6px",
                                                            borderRadius: 6,
                                                            background: "#dcfce7",
                                                            color: "#166534",
                                                        }}>
                                                            NEW
                                                        </span>
                                                    )}
                                                    {hasChanged && (
                                                        <span style={{
                                                            fontSize: 10,
                                                            fontWeight: 700,
                                                            padding: "1px 6px",
                                                            borderRadius: 6,
                                                            background: "#fef3c7",
                                                            color: "#92400e",
                                                        }}>
                                                            変更
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Current DB value for update mode */}
                                                {actionMode === "update" && currentValue !== null && currentValue !== undefined && currentValue !== "" && (
                                                    <div style={{
                                                        fontSize: 11,
                                                        color: "#94a3b8",
                                                        marginTop: 2,
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: isLongText ? "normal" : "nowrap",
                                                        maxHeight: isLongText ? 36 : undefined,
                                                    }}>
                                                        現在: {String(currentValue)}
                                                    </div>
                                                )}
                                            </div>
                                        </button>

                                        {/* Editable value */}
                                        <div style={{ padding: "0 14px 12px" }}>
                                            {isLongText ? (
                                                <textarea
                                                    value={String(value || "")}
                                                    onChange={(e) => setEditedData(prev => ({ ...prev, [key]: e.target.value }))}
                                                    rows={3}
                                                    style={{
                                                        width: "100%",
                                                        padding: "10px 12px",
                                                        borderRadius: 10,
                                                        border: "1px solid #e2e8f0",
                                                        fontSize: 14,
                                                        outline: "none",
                                                        resize: "vertical",
                                                        boxSizing: "border-box",
                                                        lineHeight: 1.5,
                                                    }}
                                                />
                                            ) : (
                                                <input
                                                    type={typeof value === "number" ? "number" : "text"}
                                                    value={String(value ?? "")}
                                                    onChange={(e) =>
                                                        setEditedData(prev => ({
                                                            ...prev,
                                                            [key]: typeof value === "number"
                                                                ? parseFloat(e.target.value) || 0
                                                                : e.target.value,
                                                        }))
                                                    }
                                                    step={typeof value === "number" ? "0.01" : undefined}
                                                    style={{
                                                        width: "100%",
                                                        padding: "10px 12px",
                                                        borderRadius: 10,
                                                        border: "1px solid #e2e8f0",
                                                        fontSize: 14,
                                                        outline: "none",
                                                        boxSizing: "border-box",
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Save / Back buttons */}
                        <button
                            onClick={handleSave}
                            disabled={isSaving || !Object.values(selectedFields).some(Boolean)}
                            style={{
                                width: "100%",
                                padding: "18px",
                                borderRadius: 16,
                                border: "none",
                                background: actionMode === "create"
                                    ? "linear-gradient(135deg, #7c3aed, #9333ea)"
                                    : "linear-gradient(135deg, #059669, #10b981)",
                                color: "#fff",
                                fontSize: 17,
                                fontWeight: 700,
                                cursor: isSaving || !Object.values(selectedFields).some(Boolean) ? "not-allowed" : "pointer",
                                opacity: isSaving || !Object.values(selectedFields).some(Boolean) ? 0.5 : 1,
                                boxShadow: "0 4px 20px rgba(5,150,105,0.3)",
                                transition: "all 0.2s",
                            }}
                        >
                            {isSaving
                                ? "⏳ 保存中..."
                                : actionMode === "create"
                                    ? "✨ 新規登録する"
                                    : `💾 「${selectedCandidate?.name}」を更新`
                            }
                        </button>

                        <button
                            onClick={() => setStep(3)}
                            style={{
                                width: "100%",
                                marginTop: 10,
                                padding: "14px",
                                borderRadius: 14,
                                border: "none",
                                background: "transparent",
                                color: "#64748b",
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >
                            ← 対象を変更
                        </button>
                    </div>
                )}

                {/* ════════════════════════════════════════ */}
                {/* STEP 5: Done */}
                {/* ════════════════════════════════════════ */}
                {step === 5 && (
                    <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "50vh",
                        gap: 20,
                    }}>
                        <div style={{
                            width: 100,
                            height: 100,
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #dcfce7, #bbf7d0)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 50,
                        }}>
                            ✅
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#166534" }}>
                            保存完了！
                        </div>
                        <div style={{ fontSize: 14, color: "#64748b", textAlign: "center" }}>
                            データがDBに反映されました
                        </div>

                        <div style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                            width: "100%",
                            marginTop: 16,
                        }}>
                            <button
                                onClick={handleReset}
                                style={{
                                    width: "100%",
                                    padding: "18px",
                                    borderRadius: 16,
                                    border: "none",
                                    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                                    color: "#fff",
                                    fontSize: 16,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
                                }}
                            >
                                📷 同じ画像で別の食材を登録
                            </button>
                            <button
                                onClick={handleFullReset}
                                style={{
                                    width: "100%",
                                    padding: "16px",
                                    borderRadius: 16,
                                    border: "2px solid #e2e8f0",
                                    background: "#fff",
                                    color: "#475569",
                                    fontSize: 15,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }}
                            >
                                🔄 新しいラベルを撮影
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* CSS Animations */}
            <style jsx global>{`
                @keyframes slideDown {
                    from { transform: translateY(-20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.08); }
                }
                @keyframes loading {
                    0% { width: 10%; margin-left: 0; }
                    50% { width: 60%; margin-left: 20%; }
                    100% { width: 10%; margin-left: 90%; }
                }
                * { -webkit-tap-highlight-color: transparent; }
                input, textarea { -webkit-appearance: none; }
                body { overflow-x: hidden; }
            `}</style>
        </div>
    );
}

export default function MobileLabelImportPage() {
    return (
        <Suspense fallback={
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100vh",
                background: "#f8fafc",
                fontSize: 16,
                color: "#64748b",
            }}>
                読み込み中...
            </div>
        }>
            <MobileLabelImportContent />
        </Suspense>
    );
}
