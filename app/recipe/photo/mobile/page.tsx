"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ─── Types ───
interface RecipeBasic {
    id: string;
    name: string;
    category: string;
    product_image_url: string | null;
    series?: string | null;
    series_code?: number | null;
}

// ─── Main Component ───
function RecipePhotoContent() {
    const searchParams = useSearchParams();
    const recipeId = searchParams.get("id");

    const [recipe, setRecipe] = useState<RecipeBasic | null>(null);
    const [recipes, setRecipes] = useState<RecipeBasic[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [uploading, setUploading] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewFile, setPreviewFile] = useState<File | null>(null);

    const cameraInputRef = useRef<HTMLInputElement | null>(null);
    const galleryInputRef = useRef<HTMLInputElement | null>(null);

    // Set viewport meta
    useEffect(() => {
        let metaViewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
        if (!metaViewport) {
            metaViewport = document.createElement("meta");
            metaViewport.name = "viewport";
            document.head.appendChild(metaViewport);
        }
        metaViewport.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
    }, []);

    // Auto-hide toast
    useEffect(() => {
        if (toastMsg) {
            const t = setTimeout(() => setToastMsg(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toastMsg]);

    // Load recipes list for selection
    useEffect(() => {
        fetchRecipes();
    }, []);

    // Auto-select recipe if ID provided
    useEffect(() => {
        if (recipeId && recipes.length > 0) {
            const found = recipes.find(r => r.id === recipeId);
            if (found) setRecipe(found);
        }
    }, [recipeId, recipes]);

    const fetchRecipes = async () => {
        const { data } = await supabase
            .from("recipes")
            .select("id, name, category, product_image_url, series, series_code")
            .in("category", ["ネット専用", "自社", "OEM"])
            .order("series_code", { ascending: true, nullsFirst: false })
            .order("name", { ascending: true });
        setRecipes(data || []);
    };

    const showToast = (text: string, type: "success" | "error") => {
        setToastMsg({ text, type });
    };

    // ─── Image Compression (target: 200-300KB) ───
    const compressImage = (file: File, maxWidth = 1200, targetSizeKB = 280): Promise<File> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width;
                let h = img.height;

                // Scale down if larger than maxWidth
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

                // Binary search for optimal quality to hit target size
                let lo = 0.1;
                let hi = 0.92;
                let bestBlob: Blob | null = null;

                const tryQuality = (quality: number): Promise<Blob> => {
                    return new Promise((res) => {
                        canvas.toBlob((blob) => res(blob!), "image/jpeg", quality);
                    });
                };

                const findOptimalQuality = async () => {
                    // Try a few iterations to find the right quality
                    for (let i = 0; i < 6; i++) {
                        const mid = (lo + hi) / 2;
                        const blob = await tryQuality(mid);
                        bestBlob = blob;

                        const sizeKB = blob.size / 1024;
                        if (sizeKB > targetSizeKB) {
                            hi = mid;
                        } else {
                            lo = mid;
                        }
                    }

                    // If still too large, reduce dimensions
                    if (bestBlob && bestBlob.size / 1024 > targetSizeKB * 1.5) {
                        const scaleFactor = Math.sqrt((targetSizeKB * 1024) / bestBlob.size);
                        const newW = Math.round(w * scaleFactor);
                        const newH = Math.round(h * scaleFactor);
                        canvas.width = newW;
                        canvas.height = newH;
                        ctx.drawImage(img, 0, 0, newW, newH);
                        bestBlob = await tryQuality(0.82);
                    }

                    const finalFile = new File(
                        [bestBlob!],
                        file.name.replace(/\.[^.]+$/, ".jpg"),
                        { type: "image/jpeg" }
                    );
                    resolve(finalFile);
                };

                findOptimalQuality().catch(reject);
            };
            img.onerror = () => reject(new Error("画像の読み込みに失敗"));
            img.src = URL.createObjectURL(file);
        });
    };

    // ─── File Handling ───
    const handleFileSelect = async (file: File) => {
        // Show preview immediately
        const preview = URL.createObjectURL(file);
        setPreviewUrl(preview);
        setPreviewFile(file);
    };

    const handleUpload = async () => {
        if (!recipe || !previewFile) return;

        setUploading(true);
        try {
            // Compress
            const originalSizeKB = Math.round(previewFile.size / 1024);
            showToast(`圧縮中... (元: ${originalSizeKB}KB)`, "success");

            const compressed = await compressImage(previewFile);
            const compressedSizeKB = Math.round(compressed.size / 1024);

            // Upload
            const formData = new FormData();
            formData.append("file", compressed);
            formData.append("recipeId", recipe.id);

            const res = await fetch("/api/recipe/upload-image", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "アップロードに失敗しました");
            }

            const data = await res.json();

            // Update local state
            setRecipe(prev => prev ? { ...prev, product_image_url: data.url } : null);
            setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, product_image_url: data.url } : r));
            setPreviewUrl(null);
            setPreviewFile(null);
            showToast(`アップロード完了 (${compressedSizeKB}KB)`, "success");
        } catch (error: any) {
            showToast(error.message || "エラーが発生しました", "error");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!recipe) return;
        if (!confirm("商品写真を削除しますか？")) return;

        setUploading(true);
        try {
            const res = await fetch("/api/recipe/upload-image", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipeId: recipe.id }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "削除に失敗しました");
            }

            setRecipe(prev => prev ? { ...prev, product_image_url: null } : null);
            setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, product_image_url: null } : r));
            showToast("写真を削除しました", "success");
        } catch (error: any) {
            showToast(error.message || "削除に失敗しました", "error");
        } finally {
            setUploading(false);
        }
    };

    const cancelPreview = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setPreviewFile(null);
    };

    const filteredRecipes = searchTerm
        ? recipes.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()))
        : recipes;

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
                        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>📸 商品写真登録</div>
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                            レシピの商品写真を撮影・アップロード
                        </div>
                    </div>
                    {recipe && (
                        <div style={{
                            fontSize: 11,
                            background: "rgba(255,255,255,0.15)",
                            padding: "4px 12px",
                            borderRadius: 20,
                            fontWeight: 600,
                            maxWidth: 140,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}>
                            {recipe.name}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ padding: "16px 16px 40px" }}>

                {/* ── Recipe Selection ── */}
                {!recipe && (
                    <div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", marginBottom: 12 }}>
                            商品を選択
                        </div>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="商品名で検索..."
                            style={{
                                width: "100%",
                                padding: "14px 16px",
                                borderRadius: 14,
                                border: "2px solid #e2e8f0",
                                fontSize: 15,
                                outline: "none",
                                boxSizing: "border-box",
                                marginBottom: 12,
                            }}
                        />
                        <div style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            maxHeight: "60vh",
                            overflowY: "auto",
                            borderRadius: 16,
                            border: "1px solid #e2e8f0",
                            background: "#fff",
                        }}>
                            {filteredRecipes.map((r) => (
                                <button
                                    key={r.id}
                                    onClick={() => { setRecipe(r); setSearchTerm(""); }}
                                    style={{
                                        width: "100%",
                                        textAlign: "left",
                                        padding: "14px 16px",
                                        borderBottom: "1px solid #f1f5f9",
                                        background: "none",
                                        border: "none",
                                        borderBottomWidth: 1,
                                        borderBottomStyle: "solid",
                                        borderBottomColor: "#f1f5f9",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                    }}
                                >
                                    {r.product_image_url ? (
                                        <img
                                            src={r.product_image_url}
                                            alt=""
                                            style={{
                                                width: 40,
                                                height: 40,
                                                borderRadius: 8,
                                                objectFit: "cover",
                                                flexShrink: 0,
                                            }}
                                        />
                                    ) : (
                                        <div style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 8,
                                            background: "#f1f5f9",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 18,
                                            color: "#cbd5e1",
                                            flexShrink: 0,
                                        }}>📷</div>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                            color: "#1e293b",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}>{r.name}</div>
                                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                                            {r.series_code ? `${r.series_code}. ${r.series}` : r.category}
                                            {r.product_image_url && " ・ 📷写真あり"}
                                        </div>
                                    </div>
                                </button>
                            ))}
                            {filteredRecipes.length === 0 && (
                                <div style={{ padding: "20px 16px", fontSize: 14, color: "#94a3b8", textAlign: "center" }}>
                                    該当する商品がありません
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Photo Upload (Recipe Selected) ── */}
                {recipe && (
                    <div>
                        {/* Selected recipe info + change button */}
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 16,
                        }}>
                            <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b" }}>
                                {recipe.name}
                            </div>
                            <button
                                onClick={() => { setRecipe(null); cancelPreview(); }}
                                style={{
                                    fontSize: 12,
                                    color: "#64748b",
                                    background: "#f1f5f9",
                                    border: "none",
                                    padding: "6px 14px",
                                    borderRadius: 10,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }}
                            >
                                変更
                            </button>
                        </div>

                        {/* Current / Preview Image */}
                        <div style={{
                            borderRadius: 16,
                            border: "2px solid #e2e8f0",
                            background: "#fff",
                            overflow: "hidden",
                            marginBottom: 16,
                        }}>
                            {(previewUrl || recipe.product_image_url) ? (
                                <div style={{ position: "relative" }}>
                                    <img
                                        src={previewUrl || recipe.product_image_url!}
                                        alt={recipe.name}
                                        style={{
                                            width: "100%",
                                            maxHeight: 400,
                                            objectFit: "contain",
                                            background: "#fafafa",
                                        }}
                                    />
                                    {previewUrl && (
                                        <div style={{
                                            position: "absolute",
                                            top: 10,
                                            right: 10,
                                            background: "#f59e0b",
                                            color: "#fff",
                                            fontSize: 11,
                                            fontWeight: 700,
                                            padding: "4px 10px",
                                            borderRadius: 8,
                                        }}>
                                            プレビュー（未保存）
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{
                                    padding: "40px 20px",
                                    textAlign: "center",
                                    color: "#cbd5e1",
                                }}>
                                    <div style={{ fontSize: 48, marginBottom: 8 }}>📷</div>
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>写真が未登録です</div>
                                    <div style={{ fontSize: 12, marginTop: 4 }}>下のボタンから撮影・選択してください</div>
                                </div>
                            )}
                        </div>

                        {/* Preview actions (Upload / Cancel) */}
                        {previewUrl && (
                            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                                <button
                                    onClick={handleUpload}
                                    disabled={uploading}
                                    style={{
                                        flex: 2,
                                        padding: "16px",
                                        borderRadius: 14,
                                        border: "none",
                                        background: uploading
                                            ? "#94a3b8"
                                            : "linear-gradient(135deg, #059669, #10b981)",
                                        color: "#fff",
                                        fontSize: 16,
                                        fontWeight: 700,
                                        cursor: uploading ? "not-allowed" : "pointer",
                                        boxShadow: "0 4px 16px rgba(5,150,105,0.3)",
                                    }}
                                >
                                    {uploading ? "⏳ アップロード中..." : "✅ この写真で登録"}
                                </button>
                                <button
                                    onClick={cancelPreview}
                                    disabled={uploading}
                                    style={{
                                        flex: 1,
                                        padding: "16px",
                                        borderRadius: 14,
                                        border: "1px solid #e2e8f0",
                                        background: "#fff",
                                        color: "#64748b",
                                        fontSize: 14,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                    }}
                                >
                                    取消
                                </button>
                            </div>
                        )}

                        {/* Camera / Gallery buttons */}
                        {!previewUrl && (
                            <>
                                {/* Hidden inputs */}
                                <input
                                    ref={cameraInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: "none" }}
                                    onChange={(e) => {
                                        if (e.target.files?.[0]) {
                                            handleFileSelect(e.target.files[0]);
                                            e.target.value = "";
                                        }
                                    }}
                                />
                                <input
                                    ref={galleryInputRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: "none" }}
                                    onChange={(e) => {
                                        if (e.target.files?.[0]) {
                                            handleFileSelect(e.target.files[0]);
                                            e.target.value = "";
                                        }
                                    }}
                                />

                                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                                    <button
                                        onClick={() => cameraInputRef.current?.click()}
                                        style={{
                                            flex: 1,
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: 8,
                                            padding: "20px 10px",
                                            borderRadius: 16,
                                            border: "2px solid #bfdbfe",
                                            background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
                                            color: "#1d4ed8",
                                            fontSize: 15,
                                            fontWeight: 700,
                                            cursor: "pointer",
                                        }}
                                    >
                                        <span style={{ fontSize: 32 }}>📷</span>
                                        撮影
                                    </button>
                                    <button
                                        onClick={() => galleryInputRef.current?.click()}
                                        style={{
                                            flex: 1,
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: 8,
                                            padding: "20px 10px",
                                            borderRadius: 16,
                                            border: "2px solid #e2e8f0",
                                            background: "#f8fafc",
                                            color: "#475569",
                                            fontSize: 15,
                                            fontWeight: 700,
                                            cursor: "pointer",
                                        }}
                                    >
                                        <span style={{ fontSize: 32 }}>📁</span>
                                        ギャラリー
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Delete button (only when image exists and no preview) */}
                        {recipe.product_image_url && !previewUrl && (
                            <button
                                onClick={handleDelete}
                                disabled={uploading}
                                style={{
                                    width: "100%",
                                    padding: "14px",
                                    borderRadius: 14,
                                    border: "1px solid #fca5a5",
                                    background: "#fef2f2",
                                    color: "#dc2626",
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    marginBottom: 16,
                                }}
                            >
                                🗑 写真を削除
                            </button>
                        )}

                        {/* Next recipe (quick navigation) */}
                        {!previewUrl && (
                            <div style={{ marginTop: 8 }}>
                                <div style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "#64748b",
                                    marginBottom: 8,
                                }}>
                                    📋 他の商品
                                </div>
                                <div style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                    maxHeight: 200,
                                    overflowY: "auto",
                                    borderRadius: 12,
                                    border: "1px solid #e2e8f0",
                                    background: "#fff",
                                }}>
                                    {recipes
                                        .filter(r => r.id !== recipe.id)
                                        .slice(0, 20)
                                        .map((r) => (
                                            <button
                                                key={r.id}
                                                onClick={() => { setRecipe(r); cancelPreview(); }}
                                                style={{
                                                    width: "100%",
                                                    textAlign: "left",
                                                    padding: "10px 14px",
                                                    borderBottom: "1px solid #f8fafc",
                                                    background: "none",
                                                    border: "none",
                                                    borderBottomWidth: 1,
                                                    borderBottomStyle: "solid",
                                                    borderBottomColor: "#f8fafc",
                                                    cursor: "pointer",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 8,
                                                    fontSize: 13,
                                                }}
                                            >
                                                <span style={{ fontSize: 14, flexShrink: 0 }}>
                                                    {r.product_image_url ? "✅" : "📷"}
                                                </span>
                                                <span style={{
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    color: "#334155",
                                                    fontWeight: 500,
                                                }}>
                                                    {r.name}
                                                </span>
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* CSS animations */}
            <style jsx global>{`
        @keyframes slideDown {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
        </div>
    );
}

export default function RecipePhotoMobilePage() {
    return (
        <Suspense fallback={
            <div style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f8fafc",
                color: "#94a3b8",
                fontSize: 16,
            }}>
                読み込み中...
            </div>
        }>
            <RecipePhotoContent />
        </Suspense>
    );
}
