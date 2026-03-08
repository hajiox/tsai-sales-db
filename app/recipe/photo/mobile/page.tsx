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

interface RecipeImage {
    id: string;
    image_url: string;
    sort_order: number;
}

const CATEGORIES = ["ネット専用", "自社", "OEM"] as const;

// ─── Main Component ───
function RecipePhotoContent() {
    const searchParams = useSearchParams();
    const recipeId = searchParams.get("id");

    const [recipe, setRecipe] = useState<RecipeBasic | null>(null);
    const [recipes, setRecipes] = useState<RecipeBasic[]>([]);
    const [recipeImages, setRecipeImages] = useState<RecipeImage[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<string>("ネット専用");
    const [uploading, setUploading] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewFile, setPreviewFile] = useState<File | null>(null);

    const cameraInputRef = useRef<HTMLInputElement | null>(null);
    const galleryInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        let metaViewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
        if (!metaViewport) {
            metaViewport = document.createElement("meta");
            metaViewport.name = "viewport";
            document.head.appendChild(metaViewport);
        }
        metaViewport.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
    }, []);

    useEffect(() => {
        if (toastMsg) {
            const t = setTimeout(() => setToastMsg(null), 3000);
            return () => clearTimeout(t);
        }
    }, [toastMsg]);

    useEffect(() => { fetchRecipes(); }, []);

    useEffect(() => {
        if (recipeId && recipes.length > 0) {
            const found = recipes.find(r => r.id === recipeId);
            if (found) selectRecipe(found);
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

    const fetchRecipeImages = async (rid: string) => {
        const res = await fetch(`/api/recipe/upload-image?recipeId=${rid}`);
        if (res.ok) {
            const data = await res.json();
            setRecipeImages(data.images || []);
        }
    };

    const selectRecipe = (r: RecipeBasic) => {
        setRecipe(r);
        fetchRecipeImages(r.id);
    };

    const showToast = (text: string, type: "success" | "error") => {
        setToastMsg({ text, type });
    };

    // ─── Compression ───
    const compressImage = (file: File, maxWidth = 1200, targetSizeKB = 280): Promise<File> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width, h = img.height;
                if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
                const canvas = document.createElement("canvas");
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (!ctx) { reject(new Error("Canvas not supported")); return; }
                ctx.drawImage(img, 0, 0, w, h);
                let lo = 0.1, hi = 0.92;
                let bestBlob: Blob | null = null;
                const tryQ = (q: number): Promise<Blob> => new Promise(res => canvas.toBlob(b => res(b!), "image/jpeg", q));
                const find = async () => {
                    for (let i = 0; i < 6; i++) {
                        const mid = (lo + hi) / 2;
                        bestBlob = await tryQ(mid);
                        if (bestBlob.size / 1024 > targetSizeKB) hi = mid; else lo = mid;
                    }
                    if (bestBlob && bestBlob.size / 1024 > targetSizeKB * 1.5) {
                        const sf = Math.sqrt((targetSizeKB * 1024) / bestBlob.size);
                        canvas.width = Math.round(w * sf); canvas.height = Math.round(h * sf);
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        bestBlob = await tryQ(0.82);
                    }
                    resolve(new File([bestBlob!], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
                };
                find().catch(reject);
            };
            img.onerror = () => reject(new Error("画像の読み込みに失敗"));
            img.src = URL.createObjectURL(file);
        });
    };

    const handleFileSelect = (file: File) => {
        setPreviewUrl(URL.createObjectURL(file));
        setPreviewFile(file);
    };

    const handleUpload = async () => {
        if (!recipe || !previewFile) return;
        setUploading(true);
        try {
            const originalKB = Math.round(previewFile.size / 1024);
            showToast(`圧縮中... (元: ${originalKB}KB)`, "success");
            const compressed = await compressImage(previewFile);
            const compKB = Math.round(compressed.size / 1024);
            const formData = new FormData();
            formData.append("file", compressed);
            formData.append("recipeId", recipe.id);
            const res = await fetch("/api/recipe/upload-image", { method: "POST", body: formData });
            if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
            const data = await res.json();
            setRecipeImages(prev => [...prev, { id: data.id, image_url: data.url, sort_order: data.sort_order }]);
            setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, product_image_url: r.product_image_url || data.url } : r));
            setRecipe(prev => prev ? { ...prev, product_image_url: prev.product_image_url || data.url } : null);
            setPreviewUrl(null);
            setPreviewFile(null);
            showToast(`アップロード完了 (${compKB}KB)`, "success");
        } catch (error: any) {
            showToast(error.message || "エラー", "error");
        } finally { setUploading(false); }
    };

    const handleDeleteImage = async (imgId: string) => {
        if (!recipe) return;
        if (!confirm("この画像を削除しますか？")) return;
        try {
            const res = await fetch("/api/recipe/upload-image", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageId: imgId, recipeId: recipe.id }),
            });
            if (!res.ok) throw new Error("削除失敗");
            setRecipeImages(prev => prev.filter(i => i.id !== imgId));
            // Update local product_image_url
            const remaining = recipeImages.filter(i => i.id !== imgId);
            const newUrl = remaining.length > 0 ? remaining[0].image_url : null;
            setRecipe(prev => prev ? { ...prev, product_image_url: newUrl } : null);
            setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, product_image_url: newUrl } : r));
            showToast("削除しました", "success");
        } catch (e: any) { showToast(e.message, "error"); }
    };

    const cancelPreview = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setPreviewFile(null);
    };

    const filteredRecipes = recipes.filter(r => {
        if (r.category !== activeTab) return false;
        if (searchTerm && !r.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
    });

    const tabCounts = CATEGORIES.map(cat => ({
        cat,
        total: recipes.filter(r => r.category === cat).length,
        done: recipes.filter(r => r.category === cat && r.product_image_url).length,
    }));

    return (
        <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)", paddingBottom: "env(safe-area-inset-bottom, 20px)" }}>
            {/* Toast */}
            {toastMsg && (
                <div style={{ position: "fixed", top: 16, left: 16, right: 16, zIndex: 100, padding: "14px 18px", borderRadius: 14, background: toastMsg.type === "success" ? "#059669" : "#dc2626", color: "#fff", fontSize: 15, fontWeight: 600, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.18)", animation: "slideDown 0.3s ease-out" }}>
                    {toastMsg.type === "success" ? "✅ " : "❌ "}{toastMsg.text}
                </div>
            )}

            {/* Header */}
            <div style={{ background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)", padding: "16px 20px", paddingTop: "max(16px, env(safe-area-inset-top))", color: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>📸 商品写真登録</div>
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>レシピの商品写真を撮影・アップロード</div>
                    </div>
                    {recipe && (
                        <button onClick={() => { setRecipe(null); cancelPreview(); setRecipeImages([]); }} style={{ fontSize: 12, background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 20, fontWeight: 600, cursor: "pointer" }}>
                            ← 一覧へ
                        </button>
                    )}
                </div>
            </div>

            <div style={{ padding: "12px 16px 40px" }}>
                {/* ── Recipe Selection ── */}
                {!recipe && (
                    <div>
                        {/* Category Tabs */}
                        <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
                            {tabCounts.map(({ cat, total, done }) => (
                                <button
                                    key={cat}
                                    onClick={() => setActiveTab(cat)}
                                    style={{
                                        padding: "10px 14px",
                                        borderRadius: 12,
                                        border: "none",
                                        background: activeTab === cat ? "#1e293b" : "#fff",
                                        color: activeTab === cat ? "#fff" : "#475569",
                                        fontSize: 13,
                                        fontWeight: 700,
                                        cursor: "pointer",
                                        whiteSpace: "nowrap",
                                        boxShadow: activeTab === cat ? "0 2px 8px rgba(0,0,0,0.15)" : "0 1px 3px rgba(0,0,0,0.06)",
                                        flexShrink: 0,
                                    }}
                                >
                                    {cat} <span style={{ fontSize: 10, opacity: 0.7 }}>({done}/{total})</span>
                                </button>
                            ))}
                        </div>

                        {/* Search */}
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="商品名で検索..."
                            style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "2px solid #e2e8f0", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
                        />

                        {/* List */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "58vh", overflowY: "auto", paddingBottom: 20 }}>
                            {filteredRecipes.map((r) => (
                                <button
                                    key={r.id}
                                    onClick={() => { selectRecipe(r); setSearchTerm(""); }}
                                    style={{
                                        width: "100%",
                                        textAlign: "left",
                                        padding: "12px 14px",
                                        borderRadius: 12,
                                        border: r.product_image_url ? "2px solid #86efac" : "1.5px solid #e2e8f0",
                                        background: r.product_image_url ? "#f0fdf4" : "#fff",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                    }}
                                >
                                    <span style={{ fontSize: 18, flexShrink: 0 }}>{r.product_image_url ? "✅" : "📷"}</span>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", lineHeight: 1.4, wordBreak: "break-all" }}>{r.name}</div>
                                </button>
                            ))}
                            {filteredRecipes.length === 0 && (
                                <div style={{ padding: "20px", fontSize: 14, color: "#94a3b8", textAlign: "center" }}>該当する商品がありません</div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Photo Upload (Recipe Selected) ── */}
                {recipe && (
                    <div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", marginBottom: 12 }}>{recipe.name}</div>

                        {/* Existing images */}
                        {recipeImages.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>📷 登録済み写真 ({recipeImages.length}枚)</div>
                                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
                                    {recipeImages.map((img) => (
                                        <div key={img.id} style={{ position: "relative", flexShrink: 0 }}>
                                            <img src={img.image_url} alt="" style={{ width: 100, height: 100, borderRadius: 12, objectFit: "cover", border: "2px solid #e2e8f0" }} />
                                            <button
                                                onClick={() => handleDeleteImage(img.id)}
                                                style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12, background: "#ef4444", color: "#fff", border: "2px solid #fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                            >✕</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Preview */}
                        {previewUrl && (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ borderRadius: 16, border: "2px solid #f59e0b", overflow: "hidden", position: "relative" }}>
                                    <img src={previewUrl} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "contain", background: "#fafafa" }} />
                                    <div style={{ position: "absolute", top: 10, right: 10, background: "#f59e0b", color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8 }}>プレビュー</div>
                                </div>
                                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                                    <button onClick={handleUpload} disabled={uploading} style={{ flex: 2, padding: "16px", borderRadius: 14, border: "none", background: uploading ? "#94a3b8" : "linear-gradient(135deg, #059669, #10b981)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: uploading ? "not-allowed" : "pointer" }}>
                                        {uploading ? "⏳ アップロード中..." : "✅ この写真で登録"}
                                    </button>
                                    <button onClick={cancelPreview} disabled={uploading} style={{ flex: 1, padding: "16px", borderRadius: 14, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>取消</button>
                                </div>
                            </div>
                        )}

                        {/* Camera / Gallery */}
                        {!previewUrl && (
                            <>
                                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) { handleFileSelect(e.target.files[0]); e.target.value = ""; } }} />
                                <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) { handleFileSelect(e.target.files[0]); e.target.value = ""; } }} />
                                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                                    <button onClick={() => cameraInputRef.current?.click()} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "20px 10px", borderRadius: 16, border: "2px solid #bfdbfe", background: "linear-gradient(135deg, #eff6ff, #dbeafe)", color: "#1d4ed8", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                                        <span style={{ fontSize: 32 }}>📷</span>撮影
                                    </button>
                                    <button onClick={() => galleryInputRef.current?.click()} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "20px 10px", borderRadius: 16, border: "2px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                                        <span style={{ fontSize: 32 }}>📁</span>ギャラリー
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Other recipes */}
                        {!previewUrl && (
                            <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>📋 他の商品</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
                                    {recipes.filter(r => r.id !== recipe.id && r.category === recipe.category).map((r) => (
                                        <button key={r.id} onClick={() => { selectRecipe(r); cancelPreview(); }} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 10, border: r.product_image_url ? "1.5px solid #86efac" : "1px solid #e2e8f0", background: r.product_image_url ? "#f0fdf4" : "#fff", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 6 }}>
                                            <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{r.product_image_url ? "✅" : "📷"}</span>
                                            <span style={{ fontSize: 11, color: "#334155", fontWeight: 500, lineHeight: 1.4, wordBreak: "break-all" }}>{r.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <style jsx global>{`
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
        </div>
    );
}

export default function RecipePhotoMobilePage() {
    return (
        <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: "#94a3b8", fontSize: 16 }}>読み込み中...</div>}>
            <RecipePhotoContent />
        </Suspense>
    );
}
