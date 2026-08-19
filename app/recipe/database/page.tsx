// app/recipe/database/page.tsx
// 材料データベースページ（食材/資材/中間部品） - Updated at 2026-02-12 15:28

"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Plus, Save, Search, Package, Trash2, Apple, Box, Layers, FileText, FlaskConical, Pencil, X, Copy, Camera, Printer, BookOpen, ClipboardList } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { convertRecipePrice, formatRecipePrice, recipePriceForDisplay } from "@/lib/recipe-price-entry";

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
    raw_materials?: string | null;
    allergens?: string | null;
    origin?: string | null;
    manufacturer?: string | null;
    product_description?: string | null;
    nutrition_per?: string | null;
    tax_included?: boolean;
    label_images?: { type: string; url: string; uploaded_at: string }[];
    isNew?: boolean;
    isModified?: boolean;
}

interface Material {
    id: string;
    name: string;
    unit_quantity: string | null;
    price: number | null;
    supplier: string | null;
    notes: string | null;
    tax_included?: boolean;
    isNew?: boolean;
    isModified?: boolean;
}

interface IntermediateProduct {
    id: string;
    name: string;
    category: string;
    selling_price: number | null;
    source_file: string | null;
}

interface Expense {
    id: string;
    name: string;
    unit_price: number | null;
    unit_quantity: number | null;
    notes: string | null;
    tax_included?: boolean;
    isNew?: boolean;
}

interface RecipeUsage {
    recipeId: string;
    recipeName: string;
    category: string | null;
    isIntermediate: boolean;
    itemCount: number;
    totalUsage: number | null;
    totalCost: number | null;
}

type TabType = "ingredients" | "materials" | "intermediate" | "expense";

export default function DatabasePage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabType>("ingredients");
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [intermediates, setIntermediates] = useState<IntermediateProduct[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [hasChanges, setHasChanges] = useState(false);
    const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
    const [editModal, setEditModal] = useState<Ingredient | null>(null);
    const [editForm, setEditForm] = useState<Record<string, string>>({});
    const [priceInputIncludesTax, setPriceInputIncludesTax] = useState(false);
    const [labelPreview, setLabelPreview] = useState<{ name: string; images: { type: string; url: string; uploaded_at: string }[] } | null>(null);
    const [recipeUsageByIngredient, setRecipeUsageByIngredient] = useState<Record<string, RecipeUsage[]>>({});
    const [recipeUsageByMaterial, setRecipeUsageByMaterial] = useState<Record<string, RecipeUsage[]>>({});
    const [recipeUsagePopover, setRecipeUsagePopover] = useState<{
        title: string;
        usages: RecipeUsage[];
        left: number;
        top: number;
    } | null>(null);
    const labelImageTypeLabels: Record<string, string> = {
        front_label: "表ラベル",
        ingredients_label: "原材料表示",
        nutrition_label: "栄養成分表示",
    };

    const [taxRates, setTaxRates] = useState({
        ingredient: 8,
        material: 10,
        amazon_fee: 10
    });

    const inputRef = useRef<HTMLInputElement>(null);
    const usagePopoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem('global_tax_settings');
        if (saved) {
            try {
                setTaxRates(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to load tax settings", e);
            }
        }
    }, []);

    const saveTaxRates = (newRates: typeof taxRates) => {
        setTaxRates(newRates);
        localStorage.setItem('global_tax_settings', JSON.stringify(newRates));
        toast.success("税率設定を保存しました（ブラウザ保存）");
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingCell]);

    const fetchData = async () => {
        setLoading(true);

        // 4テーブルを並列取得（直列比 約4倍高速化）
        const usagePromise = fetch("/api/recipe/database-usages")
            .then(res => res.ok ? res.json() : null)
            .catch(() => null);

        const [ingRes, matRes, intRes, expRes, usageRes] = await Promise.all([
            supabase.from("ingredients").select("*").order("name"),
            supabase.from("materials").select("*").order("name"),
            supabase.from("recipes").select("id, name, category, selling_price, source_file").eq("is_intermediate", true).order("name"),
            supabase.from("expenses").select("*").order("name"),
            usagePromise,
        ]);

        if (ingRes.data) setIngredients(ingRes.data.map((i: any) => ({ ...i, tax_included: i.tax_included ?? true })));
        if (matRes.data) setMaterials(matRes.data.map((m: any) => ({ ...m, tax_included: m.tax_included ?? true })));
        if (intRes.data) setIntermediates(intRes.data);
        if (expRes.data) setExpenses(expRes.data.map((e: any) => ({ ...e, tax_included: e.tax_included ?? false })));
        setRecipeUsageByIngredient(usageRes?.ingredients || {});
        setRecipeUsageByMaterial(usageRes?.materials || {});

        setLoading(false);
    };

    const handleTaxToggle = async (id: string, current: boolean, type: "ingredient" | "material" | "expense") => {
        const next = !current;
        let table = "";
        if (type === "ingredient") table = "ingredients";
        else if (type === "material") table = "materials";
        else table = "expenses";

        // Optimistic UI update
        if (type === "ingredient") {
            setIngredients(prev => prev.map(i => i.id === id ? { ...i, tax_included: next } : i));
        } else if (type === "material") {
            setMaterials(prev => prev.map(m => m.id === id ? { ...m, tax_included: next } : m));
        } else {
            setExpenses(prev => prev.map(e => e.id === id ? { ...e, tax_included: next } : e));
        }

        try {
            const res = await fetch('/api/recipe/db-write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'update', table, id, data: { tax_included: next } }),
            });
            if (!res.ok) {
                const data = await res.json();
                toast.error(`保存失敗: ${data.error}`);
            }
        } catch (e: any) {
            toast.error(`保存失敗: ${e.message}`);
        }
    };

    const handleCellDoubleClick = (id: string, field: string) => {
        if (activeTab === "intermediate") return; // 中間部品は読み取り専用
        setEditingCell({ id, field });
    };

    const handleCellChange = async (id: string, field: string, value: string, type: "ingredient" | "material" | "expense") => {
        const numericFields = ['unit_quantity', 'price', 'price_tax_included', 'unit_price', 'unit_price_tax_included', 'calories', 'protein', 'fat', 'carbohydrate', 'sodium'];
        const inputIncludesTax = field === 'price_tax_included' || field === 'unit_price_tax_included';
        const actualField = field === 'price_tax_included'
            ? 'price'
            : field === 'unit_price_tax_included'
                ? 'unit_price'
                : field;
        let parsedValue: any = value;

        if (numericFields.includes(field)) {
            if (value === '' || value === null) {
                parsedValue = null;
            } else {
                const num = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
                parsedValue = isNaN(num) ? null : num;
            }
        }

        // 入力モードと各行の保存方式に合わせてDB値へ変換する。
        let dbValue = parsedValue;
        const taxRate = type === 'ingredient' ? taxRates.ingredient : taxRates.material;
        const currentList = type === "ingredient" ? ingredients : type === "material" ? materials : expenses;
        const currentItem = currentList.find(i => i.id === id);

        if ((actualField === 'price' || actualField === 'unit_price') && parsedValue != null && currentItem) {
            dbValue = convertRecipePrice(
                parsedValue,
                inputIncludesTax,
                (currentItem as Ingredient | Material | Expense).tax_included !== false,
                taxRate,
            );
        }

        // 現在の値と比較して変更がなければスキップ
        if (actualField === 'price') {
            if (currentItem && (currentItem as any).price === dbValue) return;
        } else {
            if (currentItem && (currentItem as any)[actualField] === parsedValue) return;
        }

        // 1. UI更新 (Optimistic)
        const uiValue = (actualField === 'price') ? dbValue : parsedValue;
        if (type === "ingredient") {
            setIngredients(prev => prev.map(item =>
                item.id === id ? { ...item, [actualField]: uiValue } : item
            ));
        } else if (type === "material") {
            setMaterials(prev => prev.map(item =>
                item.id === id ? { ...item, [actualField]: uiValue } : item
            ));
        } else {
            setExpenses(prev => prev.map(item =>
                item.id === id ? { ...item, [actualField]: uiValue } : item
            ));
        }

        // 2. DB更新
        let table = "";
        if (type === "ingredient") table = "ingredients";
        else if (type === "material") table = "materials";
        else table = "expenses";
        const saveValue = (actualField === 'price') ? dbValue : parsedValue;
        try {
            const res = await fetch('/api/recipe/db-write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'update', table, id, data: { [actualField]: saveValue } }),
            });
            if (!res.ok) {
                const data = await res.json();
                toast.error(`保存失敗: ${data.error}`);
            }
        } catch (e: any) {
            toast.error(`保存失敗: ${e.message}`);
        }
    };

    const handleCellBlur = () => {
        setEditingCell(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string, field: string, type: "ingredient" | "material" | "expense") => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = e.currentTarget.value;
            handleCellChange(id, field, value, type);
            setEditingCell(null);
        }
        if (e.key === 'Tab') {
            // Tabは自然な挙動に任せるか、あるいはBlurと同様に処理
            setEditingCell(null);
        }
        if (e.key === 'Escape') {
            setEditingCell(null);
        }
    };

    const addNewIngredient = async () => {
        const newData = {
            name: "新規項目",
            unit_quantity: 1000,
            price: 0,
            tax_included: true,
        };

        try {
            const res = await fetch('/api/recipe/db-write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'insert', table: 'ingredients', data: newData }),
            });
            if (!res.ok) throw new Error('追加失敗');
            const result = await res.json();
            setSearchTerm("");
            setIngredients(prev => [{ ...result.data, isNew: true }, ...prev]);
            setEditingCell({ id: result.data.id, field: 'name' });
        } catch (e: any) {
            toast.error(`追加失敗: ${e.message}`);
        }
    };

    const addNewMaterial = async () => {
        const newData = {
            name: "新規資材",
            unit_quantity: "1",
            price: 0,
            tax_included: true,
        };

        try {
            const res = await fetch('/api/recipe/db-write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'insert', table: 'materials', data: newData }),
            });
            if (!res.ok) throw new Error('追加失敗');
            const result = await res.json();
            setSearchTerm("");
            setMaterials(prev => [{ ...result.data, isNew: true }, ...prev]);
            setEditingCell({ id: result.data.id, field: 'name' });
        } catch (e: any) {
            toast.error(`追加失敗: ${e.message}`);
        }
    };

    const addNewExpense = async () => {
        const newData = {
            name: "新規諸経費",
            unit_price: 0,
            unit_quantity: 1,
            tax_included: false,
        };

        try {
            const res = await fetch('/api/recipe/db-write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'insert', table: 'expenses', data: newData }),
            });
            if (!res.ok) throw new Error('追加失敗');
            const result = await res.json();
            setSearchTerm("");
            setExpenses(prev => [{ ...result.data, isNew: true }, ...prev]);
            setEditingCell({ id: result.data.id, field: 'name' });
        } catch (e: any) {
            toast.error(`追加失敗: ${e.message}`);
        }
    };

    const addNewCurrentItem = () => {
        if (activeTab === "ingredients") return addNewIngredient();
        if (activeTab === "materials") return addNewMaterial();
        if (activeTab === "expense") return addNewExpense();
    };

    const deleteIngredient = async (id: string) => {
        if (id.startsWith('new-')) {
            setIngredients(prev => prev.filter(i => i.id !== id));
        } else {
            if (confirm('この食材を削除しますか？')) {
                try {
                    const res = await fetch('/api/recipe/db-write', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ operation: 'delete', table: 'ingredients', id }),
                    });
                    if (!res.ok) throw new Error('削除失敗');
                    setIngredients(prev => prev.filter(i => i.id !== id));
                    toast.success('削除しました');
                } catch (e: any) {
                    toast.error(`削除失敗: ${e.message}`);
                }
            }
        }
    };

    const deleteMaterial = async (id: string) => {
        if (id.startsWith('new-')) {
            setMaterials(prev => prev.filter(m => m.id !== id));
        } else {
            if (confirm('この資材を削除しますか？')) {
                try {
                    const res = await fetch('/api/recipe/db-write', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ operation: 'delete', table: 'materials', id }),
                    });
                    if (!res.ok) throw new Error('削除失敗');
                    setMaterials(prev => prev.filter(m => m.id !== id));
                    toast.success('削除しました');
                } catch (e: any) {
                    toast.error(`削除失敗: ${e.message}`);
                }
            }
        }
    };

    const duplicateIngredient = async (ing: Ingredient) => {
        try {
            const newData: Record<string, any> = {
                name: `${ing.name}（コピー）`,
                unit_quantity: ing.unit_quantity,
                price: ing.price,
                tax_included: ing.tax_included,
                calories: ing.calories,
                protein: ing.protein,
                fat: ing.fat,
                carbohydrate: ing.carbohydrate,
                sodium: ing.sodium,
                raw_materials: ing.raw_materials || null,
                allergens: ing.allergens || null,
                origin: ing.origin || null,
                manufacturer: ing.manufacturer || null,
            };
            const res = await fetch('/api/recipe/db-write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'insert', table: 'ingredients', data: newData }),
            });
            if (!res.ok) throw new Error('コピー失敗');
            const result = await res.json();
            setIngredients(prev => [{ ...result.data, isNew: true }, ...prev]);
            setEditingCell({ id: result.data.id, field: 'name' });
            toast.success('コピーしました');
        } catch (e: any) {
            toast.error(`コピー失敗: ${e.message}`);
        }
    };

    const duplicateMaterial = async (mat: Material) => {
        try {
            const newData: Record<string, any> = {
                name: `${mat.name}（コピー）`,
                price: mat.price,
                tax_included: mat.tax_included,
                unit_quantity: mat.unit_quantity || null,
                supplier: mat.supplier || null,
                notes: mat.notes || null,
            };
            const res = await fetch('/api/recipe/db-write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'insert', table: 'materials', data: newData }),
            });
            if (!res.ok) throw new Error('コピー失敗');
            const result = await res.json();
            setMaterials(prev => [{ ...result.data, isNew: true }, ...prev]);
            setEditingCell({ id: result.data.id, field: 'name' });
            toast.success('コピーしました');
        } catch (e: any) {
            toast.error(`コピー失敗: ${e.message}`);
        }
    };

    // saveChanges logic is removed in favor of auto-save
    const saveChanges = async () => { };

    // 食材編集モーダルを開く
    // アイテムのテーブル間移動（資材⇔諸経費）
    const moveItem = async (id: string, fromTable: "materials" | "expenses", toTable: "materials" | "expenses") => {
        if (fromTable === toTable) return;
        const label = toTable === "expenses" ? "諸経費" : "資材";
        if (!confirm(`この項目を「${label}」に移動しますか？`)) return;

        try {
            // 1. 元のデータを取得
            let itemData: any;
            if (fromTable === "materials") {
                itemData = materials.find(m => m.id === id);
            } else {
                itemData = expenses.find(e => e.id === id);
            }
            if (!itemData) return;

            // 2. 移動先にinsert
            const newData: any = { name: itemData.name, tax_included: itemData.tax_included ?? false };
            if (toTable === "expenses") {
                newData.unit_price = itemData.price ?? itemData.unit_price ?? 0;
                newData.notes = itemData.notes ?? null;
            } else {
                newData.price = itemData.unit_price ?? itemData.price ?? 0;
                newData.notes = itemData.notes ?? null;
            }

            const insertRes = await fetch('/api/recipe/db-write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'insert', table: toTable, data: newData }),
            });
            if (!insertRes.ok) throw new Error('移動先への追加に失敗');

            // 3. 元テーブルから削除
            const deleteRes = await fetch('/api/recipe/db-write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'delete', table: fromTable, id }),
            });
            if (!deleteRes.ok) throw new Error('元データの削除に失敗');

            toast.success(`「${label}」に移動しました`);
            fetchData();
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    // 食材編集モーダルを開く
    const openEditModal = (ing: Ingredient) => {
        setEditModal(ing);
        const inputPrice = recipePriceForDisplay(
            ing.price,
            priceInputIncludesTax,
            ing.tax_included !== false,
            taxRates.ingredient,
        );
        setEditForm({
            price: formatRecipePrice(inputPrice),
            unit_quantity: ing.unit_quantity != null ? String(ing.unit_quantity) : '',
            raw_materials: ing.raw_materials || '',
            allergens: ing.allergens || '',
            origin: ing.origin || '',
            manufacturer: ing.manufacturer || '',
            product_description: ing.product_description || '',
            nutrition_per: ing.nutrition_per || '',
        });
    };

    const changePriceInputMode = (nextIncludesTax: boolean) => {
        if (editModal && editForm.price.trim()) {
            const currentValue = Number(editForm.price.replace(/,/g, ''));
            if (Number.isFinite(currentValue)) {
                const converted = convertRecipePrice(
                    currentValue,
                    priceInputIncludesTax,
                    nextIncludesTax,
                    taxRates.ingredient,
                );
                setEditForm(prev => ({ ...prev, price: formatRecipePrice(converted) }));
            }
        }
        setPriceInputIncludesTax(nextIncludesTax);
    };

    // 食材編集保存
    const saveEditModal = async () => {
        if (!editModal) return;
        const updates: Record<string, any> = {};
        for (const [key, val] of Object.entries(editForm)) {
            if (key === 'price') {
                const numVal = val ? parseFloat(val) : null;
                updates[key] = numVal == null
                    ? null
                    : convertRecipePrice(
                        numVal,
                        priceInputIncludesTax,
                        editModal.tax_included !== false,
                        taxRates.ingredient,
                    );
            } else if (key === 'unit_quantity') {
                updates[key] = val ? parseFloat(val) : null;
            } else {
                updates[key] = val.trim() || null;
            }
        }
        try {
            const res = await fetch('/api/recipe/db-write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operation: 'update', table: 'ingredients', id: editModal.id, data: updates }),
            });
            if (!res.ok) throw new Error('保存に失敗しました');
            toast.success('保存しました');
            setIngredients(prev => prev.map(i => i.id === editModal.id ? { ...i, ...updates } : i));
            setEditModal(null);
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    // フィルタリング
    const filteredIngredients = ingredients.filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const filteredMaterials = materials.filter(m =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const filteredIntermediates = intermediates.filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const filteredExpenses = expenses.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatNumber = (value: number | null, decimals = 2) => {
        if (value === null || value === undefined) return '';
        return value.toFixed(decimals);
    };

    const renderEditableCell = (
        item: Ingredient | Material | Expense,
        field: string,
        displayValue: string,
        type: "ingredient" | "material" | "expense",
        width: string = 'w-24'
    ) => {
        const isEditing = editingCell?.id === item.id && editingCell?.field === field;

        if (isEditing) {
            return (
                <input
                    ref={inputRef}
                    type="text"
                    defaultValue={displayValue}
                    onBlur={(e) => {
                        handleCellChange(item.id, field, e.target.value, type);
                        setEditingCell(null);
                    }}
                    onKeyDown={(e) => handleKeyDown(e, item.id, field, type)}
                    className="w-full h-full px-2 py-1 border border-blue-500 rounded text-sm focus:outline-none bg-white"
                />
            );
        }

        return (
            <div
                className="w-full h-full px-2 py-1 cursor-pointer hover:bg-blue-50 rounded min-h-[1.5rem]"
                onClick={() => setEditingCell({ id: item.id, field })}
            >
                {displayValue || <span className="text-gray-300">-</span>}
            </div>
        );
    };

    const renderCalculatedPrice = (value: number | null) => (
        <div className="min-h-[1.5rem] w-full px-2 py-1 text-gray-500">
            {value == null ? <span className="text-gray-300">-</span> : `¥${formatRecipePrice(value)}`}
        </div>
    );

    const formatCompactValue = (value: number | null | undefined, decimals = 2) => {
        if (value === null || value === undefined || Number.isNaN(value)) return "";
        return new Intl.NumberFormat("ja-JP", {
            maximumFractionDigits: Math.abs(value) >= 100 ? 1 : decimals,
        }).format(value);
    };

    const keepRecipeUsagePopover = () => {
        if (usagePopoverTimer.current) {
            clearTimeout(usagePopoverTimer.current);
            usagePopoverTimer.current = null;
        }
    };

    const hideRecipeUsagePopoverSoon = () => {
        keepRecipeUsagePopover();
        usagePopoverTimer.current = setTimeout(() => {
            setRecipeUsagePopover(null);
        }, 140);
    };

    const showRecipeUsagePopover = (
        event: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>,
        title: string,
        usages: RecipeUsage[]
    ) => {
        if (!usages.length) return;
        keepRecipeUsagePopover();

        const rect = event.currentTarget.getBoundingClientRect();
        const width = Math.min(380, window.innerWidth - 24);
        const estimatedHeight = Math.min(340, 92 + usages.length * 34);
        const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
        const bottomTop = rect.bottom + 8;
        const top = bottomTop + estimatedHeight > window.innerHeight
            ? Math.max(12, rect.top - estimatedHeight - 8)
            : bottomTop;

        setRecipeUsagePopover({ title, usages, left, top });
    };

    const renderRecipeUsageButton = (title: string, usages: RecipeUsage[] | undefined) => {
        if (!usages || usages.length === 0) return null;

        return (
            <button
                type="button"
                className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 text-[10px] font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                onMouseEnter={(event) => showRecipeUsagePopover(event, title, usages)}
                onMouseLeave={hideRecipeUsagePopoverSoon}
                onFocus={(event) => showRecipeUsagePopover(event, title, usages)}
                onBlur={hideRecipeUsagePopoverSoon}
                onClick={(event) => showRecipeUsagePopover(event, title, usages)}
                title="使用レシピを見る"
            >
                <BookOpen className="h-3 w-3" />
                <span>レシピ</span>
                <span className="ml-0.5 rounded-full bg-white/80 px-1 text-[9px] leading-4 text-indigo-800">
                    {usages.length}
                </span>
            </button>
        );
    };

    const tabs = [
        { key: "ingredients" as TabType, label: "食材", icon: Apple, count: ingredients.length },
        { key: "materials" as TabType, label: "資材", icon: Box, count: materials.length },
        { key: "intermediate" as TabType, label: "中間部品【P】", icon: Layers, count: intermediates.length },
        { key: "expense" as TabType, label: "諸経費", icon: Search, count: expenses.length },
    ];

    return (
        <div className="h-full flex flex-col">
            {/* Mobile header */}
            <div className="mb-4 space-y-3 lg:hidden">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => router.push("/recipe")} aria-label="レシピ一覧へ戻る">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="min-w-0">
                        <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                            <Package className="h-5 w-5 shrink-0" />
                            材料データベース
                        </h1>
                        <p className="text-xs text-gray-500">項目をタップして編集</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {activeTab !== "intermediate" && (
                        <Button onClick={addNewCurrentItem} className="col-span-2 h-11 bg-blue-600 hover:bg-blue-700">
                            <Plus className="mr-2 h-4 w-4" />
                            {activeTab === "ingredients" ? "食材" : activeTab === "materials" ? "資材" : "諸経費"}を新規追加
                        </Button>
                    )}
                    <Button onClick={() => router.push("/recipe/database/quote-import")} variant="outline" className="h-10 border-blue-300 text-blue-700">
                        <FileText className="mr-1.5 h-4 w-4" />
                        見積書AI
                    </Button>
                    <Button onClick={() => router.push("/recipe/database/label-import")} variant="outline" className="h-10 border-amber-300 text-amber-700">
                        <Camera className="mr-1.5 h-4 w-4" />
                        ラベルAI
                    </Button>
                    <Button onClick={() => router.push("/recipe/inventory")} variant="outline" className="col-span-2 h-10">
                        <ClipboardList className="mr-1.5 h-4 w-4" />
                        製造棚卸し
                    </Button>
                </div>
            </div>

            {/* Header */}
            <div className="mb-4 hidden items-center justify-between lg:flex">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.push("/recipe")}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        戻る
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Package className="w-6 h-6" />
                            材料データベース
                        </h1>
                        <p className="text-gray-600 text-sm">ダブルクリックで編集</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => router.push("/recipe/inventory")} className="bg-slate-900 hover:bg-slate-800">
                        <ClipboardList className="w-4 h-4 mr-2" />
                        製造棚卸し
                    </Button>
                    <Button onClick={() => router.push("/recipe/database/quote-import")} variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50">
                        <FileText className="w-4 h-4 mr-2" />
                        見積書AI取込
                    </Button>
                    <Button onClick={() => router.push("/recipe/database/label-import")} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
                        <FileText className="w-4 h-4 mr-2" />
                        ラベルAI取込
                    </Button>
                    {activeTab !== "intermediate" && (
                        <Button onClick={addNewCurrentItem} variant="outline">
                            <Plus className="w-4 h-4 mr-2" />
                            新規追加
                        </Button>
                    )}
                </div>
            </div>

            {/* Mobile tax settings */}
            <details className="mb-4 rounded-lg border border-blue-200 bg-blue-50 lg:hidden">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-bold text-blue-900">
                    税率・手数料設定
                    <span className="text-xs font-normal text-blue-600">タップして開く</span>
                </summary>
                <div className="space-y-3 border-t border-blue-200 p-3">
                    <div className="grid grid-cols-3 gap-2">
                        <label className="space-y-1 text-xs text-gray-600">
                            <span>食材</span>
                            <div className="relative">
                                <Input
                                    type="number"
                                    value={taxRates.ingredient}
                                    onChange={(e) => setTaxRates({ ...taxRates, ingredient: parseInt(e.target.value) || 0 })}
                                    className="h-10 bg-white pr-7 text-right"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                            </div>
                        </label>
                        <label className="space-y-1 text-xs text-gray-600">
                            <span>資材</span>
                            <div className="relative">
                                <Input
                                    type="number"
                                    value={taxRates.material}
                                    onChange={(e) => setTaxRates({ ...taxRates, material: parseInt(e.target.value) || 0 })}
                                    className="h-10 bg-white pr-7 text-right"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                            </div>
                        </label>
                        <label className="space-y-1 text-xs text-gray-600">
                            <span>Amazon</span>
                            <div className="relative">
                                <Input
                                    type="number"
                                    value={taxRates.amazon_fee}
                                    onChange={(e) => setTaxRates({ ...taxRates, amazon_fee: parseInt(e.target.value) || 0 })}
                                    className="h-10 bg-white pr-7 text-right"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                            </div>
                        </label>
                    </div>
                    <Button onClick={() => saveTaxRates(taxRates)} className="h-10 w-full bg-blue-600 hover:bg-blue-700">
                        <Save className="mr-2 h-4 w-4" />
                        設定を保存
                    </Button>
                    <p className="text-[11px] leading-4 text-blue-700">全件の税込・税抜一括変更はPC版から操作できます。</p>
                </div>
            </details>

            {/* Global Tax Settings */}
            <div className="mb-6 hidden flex-wrap items-center gap-8 rounded-lg border border-blue-200 bg-blue-50 p-4 lg:flex">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-800">一括税率設定:</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">食材 (軽減税率)</span>
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                value={taxRates.ingredient}
                                onChange={(e) => setTaxRates({ ...taxRates, ingredient: parseInt(e.target.value) || 0 })}
                                className="w-16 h-8 text-right bg-white"
                            />
                            <span className="text-sm text-gray-500">%</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">資材・包材</span>
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                value={taxRates.material}
                                onChange={(e) => setTaxRates({ ...taxRates, material: parseInt(e.target.value) || 0 })}
                                className="w-16 h-8 text-right bg-white"
                            />
                            <span className="text-sm text-gray-500">%</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 border-l pl-4 border-blue-200">
                        <span className="text-xs text-gray-600">Amazon手数料</span>
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                value={taxRates.amazon_fee}
                                onChange={(e) => setTaxRates({ ...taxRates, amazon_fee: parseInt(e.target.value) || 0 })}
                                className="w-16 h-8 text-right bg-white"
                            />
                            <span className="text-sm text-gray-500">%</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 border-l pl-4 border-blue-200">
                        <Button
                            size="sm"
                            variant="outline"
                            className="bg-white text-xs h-8 border-blue-300 text-blue-700 hover:bg-blue-100"
                            onClick={async () => {
                                if (!confirm(`${activeTab === 'ingredients' ? '食材' : '資材'}を全て「税込」に一括設定しますか？`)) return;
                                const table = activeTab === 'ingredients' ? 'ingredients' : 'materials';
                                try {
                                    await fetch('/api/recipe/db-write', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ operation: 'bulk_update', table, field: 'tax_included', value: true, filterField: 'tax_included', filterOp: 'is_null', filterValue: null }),
                                    });
                                    await fetch('/api/recipe/db-write', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ operation: 'bulk_update', table, field: 'tax_included', value: true, filterField: 'tax_included', filterOp: 'neq', filterValue: true }),
                                    });
                                    toast.success("全て税込に設定しました");
                                    fetchData();
                                } catch { toast.error("一括更新に失敗しました"); }
                            }}
                        >
                            全て税込
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="bg-white text-xs h-8 border-blue-300 text-blue-700 hover:bg-blue-100"
                            onClick={async () => {
                                if (!confirm(`${activeTab === 'ingredients' ? '食材' : '資材'}を全て「税抜」に一括設定しますか？`)) return;
                                const table = activeTab === 'ingredients' ? 'ingredients' : 'materials';
                                try {
                                    await fetch('/api/recipe/db-write', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ operation: 'bulk_update', table, field: 'tax_included', value: false, filterField: 'tax_included', filterOp: 'is_null', filterValue: null }),
                                    });
                                    await fetch('/api/recipe/db-write', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ operation: 'bulk_update', table, field: 'tax_included', value: false, filterField: 'tax_included', filterOp: 'neq', filterValue: false }),
                                    });
                                    toast.success("全て税抜に設定しました");
                                    fetchData();
                                } catch { toast.error("一括更新に失敗しました"); }
                            }}
                        >
                            全て税抜
                        </Button>
                    </div>
                    <Button size="sm" onClick={() => saveTaxRates(taxRates)} className="bg-blue-600 hover:bg-blue-700 h-8 ml-auto">
                        <Save className="w-3 h-3 mr-1" />
                        保存
                    </Button>
                </div>
                <div className="text-[10px] text-blue-500 max-w-sm">
                    ※ これらの値は全てのレシピの原価計算に使用されます。<br />
                    ※ Amazon手数料、人件費、中間部品などは自動的に対象外となります。
                </div>
            </div>

            {/* Tabs */}
            <div className="mb-3 flex snap-x gap-1 overflow-x-auto border-b border-gray-300 pb-px lg:mb-4 lg:gap-0 lg:overflow-visible">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => {
                                setActiveTab(tab.key);
                                setSearchTerm("");
                            }}
                            className={`-mb-px flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-t-lg border-l border-r border-t px-3 py-2 text-sm font-medium transition lg:gap-2 lg:px-6 lg:py-3 ${activeTab === tab.key
                                ? "bg-white border-gray-300 text-gray-900"
                                : "bg-gray-100 border-transparent text-gray-500 hover:text-gray-700"
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === tab.key ? "bg-blue-100 text-blue-800" : "bg-gray-200 text-gray-600"
                                }`}>
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Search */}
            <div className="mb-3 flex flex-col gap-2 lg:mb-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                        placeholder="検索..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-11 pl-10 lg:h-9"
                    />
                </div>
                {activeTab !== "intermediate" && (
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 lg:min-h-9">
                        <Checkbox
                            checked={priceInputIncludesTax}
                            onCheckedChange={(checked) => changePriceInputMode(checked === true)}
                            aria-label="税込金額から税別単価を計算"
                        />
                        <span className="font-medium">税込から計算</span>
                        <span className="text-xs text-gray-400">税込額を入力して税別を逆算</span>
                    </label>
                )}
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 pb-4 lg:hidden">
                {loading ? (
                    <div className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">読み込み中...</div>
                ) : activeTab === "ingredients" ? (
                    filteredIngredients.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">該当する食材がありません</div>
                    ) : filteredIngredients.map((ing, index) => {
                        const taxExclusive = ing.price != null
                            ? (ing.tax_included !== false ? ing.price / (1 + taxRates.ingredient / 100) : ing.price)
                            : null;
                        const taxIncluded = ing.price != null
                            ? (ing.tax_included !== false ? ing.price : ing.price * (1 + taxRates.ingredient / 100))
                            : null;
                        return (
                            <article key={ing.id} className={`rounded-lg border bg-white p-3 shadow-sm ${ing.isNew ? "border-green-300 bg-green-50" : ing.isModified ? "border-amber-300 bg-amber-50" : "border-gray-200"}`}>
                                <div className="flex items-start gap-2">
                                    <span className="pt-1 text-xs font-semibold text-gray-400">{index + 1}</span>
                                    <div className="min-w-0 flex-1 font-semibold text-gray-900">
                                        {renderEditableCell(ing, "name", ing.name, "ingredient", "w-full")}
                                    </div>
                                    <div className="flex shrink-0 items-center">
                                        <Button variant="ghost" size="icon" onClick={() => openEditModal(ing)} className="h-10 w-10 text-blue-600" aria-label={`${ing.name}を編集`}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => duplicateIngredient(ing)} className="h-10 w-10 text-green-600" aria-label={`${ing.name}を複製`}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => deleteIngredient(ing.id)} className="h-10 w-10 text-red-600" aria-label={`${ing.name}を削除`}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleTaxToggle(ing.id, !!ing.tax_included, "ingredient")}
                                        className={`min-h-8 rounded border px-2 text-xs font-bold ${ing.tax_included ? "border-green-200 bg-green-100 text-green-700" : "border-gray-200 bg-gray-100 text-gray-600"}`}
                                    >
                                        {ing.tax_included ? "税込設定" : "税抜設定"}
                                    </button>
                                    {renderRecipeUsageButton(ing.name, recipeUsageByIngredient[ing.id])}
                                    {ing.raw_materials && (
                                        <button type="button" onClick={() => openEditModal(ing)} className="inline-flex min-h-8 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 text-xs font-medium text-emerald-700">
                                            <FlaskConical className="h-3.5 w-3.5" />原材料情報
                                        </button>
                                    )}
                                    {ing.label_images && ing.label_images.length > 0 && (
                                        <button type="button" onClick={() => setLabelPreview({ name: ing.name, images: ing.label_images! })} className="inline-flex min-h-8 items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 text-xs font-medium text-blue-700">
                                            <Camera className="h-3.5 w-3.5" />ラベル {ing.label_images.length}枚
                                        </button>
                                    )}
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
                                    <div><p className="text-[11px] text-gray-500">入数(g)</p>{renderEditableCell(ing, "unit_quantity", formatNumber(ing.unit_quantity, 0), "ingredient", "w-full")}</div>
                                    <div>
                                        <p className="text-[11px] text-gray-500">税別単価 {priceInputIncludesTax ? "（自動）" : "（入力）"}</p>
                                        {priceInputIncludesTax
                                            ? renderCalculatedPrice(taxExclusive)
                                            : renderEditableCell(ing, "price", taxExclusive != null ? `¥${formatRecipePrice(taxExclusive)}` : "-", "ingredient", "w-full")}
                                    </div>
                                    <div>
                                        <p className="text-[11px] text-gray-500">税込単価 {priceInputIncludesTax ? "（入力）" : "（自動）"}</p>
                                        {priceInputIncludesTax
                                            ? renderEditableCell(ing, "price_tax_included", taxIncluded != null ? `¥${formatRecipePrice(taxIncluded)}` : "-", "ingredient", "w-full")
                                            : renderCalculatedPrice(taxIncluded)}
                                    </div>
                                </div>
                                <details className="mt-2 border-t border-gray-100 pt-2">
                                    <summary className="min-h-9 cursor-pointer py-2 text-xs font-medium text-gray-600">栄養成分を確認・編集</summary>
                                    <div className="grid grid-cols-2 gap-2 pt-1">
                                        {[
                                            ["熱量", "calories", formatNumber(ing.calories, 1)],
                                            ["タンパク", "protein", formatNumber(ing.protein, 1)],
                                            ["脂質", "fat", formatNumber(ing.fat, 1)],
                                            ["炭水化物", "carbohydrate", formatNumber(ing.carbohydrate, 1)],
                                            ["食塩", "sodium", formatNumber(ing.sodium, 2)],
                                        ].map(([label, field, value]) => (
                                            <div key={field}><p className="text-[11px] text-gray-500">{label}</p>{renderEditableCell(ing, field, value, "ingredient", "w-full")}</div>
                                        ))}
                                    </div>
                                </details>
                            </article>
                        );
                    })
                ) : activeTab === "materials" ? (
                    filteredMaterials.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">該当する資材がありません</div>
                    ) : filteredMaterials.map((mat, index) => {
                        const taxExclusive = mat.price != null
                            ? (mat.tax_included !== false ? mat.price / (1 + taxRates.material / 100) : mat.price)
                            : null;
                        const taxIncluded = mat.price != null
                            ? (mat.tax_included !== false ? mat.price : mat.price * (1 + taxRates.material / 100))
                            : null;
                        return (
                            <article key={mat.id} className={`rounded-lg border bg-white p-3 shadow-sm ${mat.isNew ? "border-green-300 bg-green-50" : mat.isModified ? "border-amber-300 bg-amber-50" : "border-gray-200"}`}>
                                <div className="flex items-start gap-2">
                                    <span className="pt-1 text-xs font-semibold text-gray-400">{index + 1}</span>
                                    <div className="min-w-0 flex-1 font-semibold text-gray-900">{renderEditableCell(mat, "name", mat.name, "material", "w-full")}</div>
                                    <div className="flex shrink-0 items-center">
                                        <Button variant="ghost" size="icon" onClick={() => duplicateMaterial(mat)} className="h-10 w-10 text-green-600" aria-label={`${mat.name}を複製`}><Copy className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" onClick={() => deleteMaterial(mat.id)} className="h-10 w-10 text-red-600" aria-label={`${mat.name}を削除`}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={() => handleTaxToggle(mat.id, !!mat.tax_included, "material")} className={`min-h-8 rounded border px-2 text-xs font-bold ${mat.tax_included ? "border-green-200 bg-green-100 text-green-700" : "border-gray-200 bg-gray-100 text-gray-600"}`}>
                                        {mat.tax_included ? "税込設定" : "税抜設定"}
                                    </button>
                                    {renderRecipeUsageButton(mat.name, recipeUsageByMaterial[mat.id])}
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
                                    <div><p className="text-[11px] text-gray-500">入数</p>{renderEditableCell(mat, "unit_quantity", mat.unit_quantity || "", "material", "w-full")}</div>
                                    <div>
                                        <p className="text-[11px] text-gray-500">税別単価 {priceInputIncludesTax ? "（自動）" : "（入力）"}</p>
                                        {priceInputIncludesTax
                                            ? renderCalculatedPrice(taxExclusive)
                                            : renderEditableCell(mat, "price", taxExclusive != null ? `¥${formatRecipePrice(taxExclusive)}` : "-", "material", "w-full")}
                                    </div>
                                    <div>
                                        <p className="text-[11px] text-gray-500">税込単価 {priceInputIncludesTax ? "（入力）" : "（自動）"}</p>
                                        {priceInputIncludesTax
                                            ? renderEditableCell(mat, "price_tax_included", taxIncluded != null ? `¥${formatRecipePrice(taxIncluded)}` : "-", "material", "w-full")
                                            : renderCalculatedPrice(taxIncluded)}
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div><p className="text-[11px] text-gray-500">仕入先</p>{renderEditableCell(mat, "supplier", mat.supplier || "", "material", "w-full")}</div>
                                    <div><p className="text-[11px] text-gray-500">備考</p>{renderEditableCell(mat, "notes", mat.notes || "", "material", "w-full")}</div>
                                </div>
                                <button type="button" onClick={() => moveItem(mat.id, "materials", "expenses")} className="mt-3 min-h-10 w-full rounded border border-orange-200 bg-orange-50 text-xs font-medium text-orange-700">諸経費へ移動</button>
                            </article>
                        );
                    })
                ) : activeTab === "expense" ? (
                    filteredExpenses.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">該当する諸経費がありません</div>
                    ) : filteredExpenses.map((exp, index) => {
                        const displayPrice = recipePriceForDisplay(
                            exp.unit_price,
                            priceInputIncludesTax,
                            exp.tax_included !== false,
                            taxRates.material,
                        );
                        return (
                        <article key={exp.id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-400">{index + 1}</span>
                                <div className="min-w-0 flex-1 font-semibold text-gray-900">{renderEditableCell(exp, "name", exp.name, "expense", "w-full")}</div>
                                <button type="button" onClick={() => handleTaxToggle(exp.id, !!exp.tax_included, "expense")} className={`min-h-8 shrink-0 rounded border px-2 text-xs font-bold ${exp.tax_included ? "border-green-200 bg-green-100 text-green-700" : "border-gray-200 bg-gray-100 text-gray-600"}`}>
                                    {exp.tax_included ? "税込" : "税抜"}
                                </button>
                            </div>
                            <div className="mt-3 grid grid-cols-[110px_minmax(0,1fr)] gap-2 border-t border-gray-100 pt-3">
                                <div>
                                    <p className="text-[11px] text-gray-500">{priceInputIncludesTax ? "税込単価（入力）" : "税別単価（入力）"}</p>
                                    {renderEditableCell(
                                        exp,
                                        priceInputIncludesTax ? "unit_price_tax_included" : "unit_price",
                                        displayPrice != null ? `¥${formatRecipePrice(displayPrice)}` : "-",
                                        "expense",
                                        "w-full",
                                    )}
                                </div>
                                <div><p className="text-[11px] text-gray-500">備考</p>{renderEditableCell(exp, "notes", exp.notes || "", "expense", "w-full")}</div>
                            </div>
                            <button type="button" onClick={() => moveItem(exp.id, "expenses", "materials")} className="mt-3 min-h-10 w-full rounded border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700">資材へ移動</button>
                        </article>
                        );
                    })
                ) : filteredIntermediates.length === 0 ? (
                    <div className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">該当する中間部品がありません</div>
                ) : filteredIntermediates.map((item, index) => (
                    <button key={item.id} type="button" onClick={() => router.push(`/recipe/${item.id}`)} className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="pt-0.5 text-xs font-semibold text-gray-400">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold text-gray-900">{item.name}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                    <span className="rounded bg-purple-100 px-2 py-1 font-medium text-purple-800">{item.category || "未分類"}</span>
                                    <span className="font-semibold text-gray-800">{item.selling_price ? `¥${item.selling_price.toLocaleString()}` : "価格未設定"}</span>
                                </div>
                                {item.source_file && <p className="mt-2 truncate text-xs text-gray-500">{item.source_file.replace("【重要】【製造】総合管理（新型）", "").replace(".xlsx", "")}</p>}
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="hidden flex-1 overflow-auto rounded-b-lg border border-t-0 border-gray-300 bg-white lg:block">
                {loading ? (
                    <div className="text-center py-8 text-gray-500">読み込み中...</div>
                ) : activeTab === "ingredients" ? (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-100 z-10">
                            <tr className="border-b">
                                <th className="px-2 py-2 text-left w-10">NO</th>
                                <th className="px-2 py-2 text-left min-w-[200px]">食材名</th>
                                <th className="px-2 py-2 text-center w-20">税込設定</th>
                                <th className="px-2 py-2 text-right w-24">入数(g)</th>
                                <th className={`px-2 py-2 text-right w-28 ${priceInputIncludesTax ? "" : "bg-blue-50 text-blue-800"}`}>税別単価<br /><span className="text-[10px] font-normal">{priceInputIncludesTax ? "自動計算" : "入力"}</span></th>
                                <th className={`px-2 py-2 text-right w-28 ${priceInputIncludesTax ? "bg-blue-50 text-blue-800" : ""}`}>税込単価<br /><span className="text-[10px] font-normal">{priceInputIncludesTax ? "入力" : "自動計算"}</span></th>
                                <th className="px-2 py-2 text-right w-20">熱量</th>
                                <th className="px-2 py-2 text-right w-20">タンパク</th>
                                <th className="px-2 py-2 text-right w-20">脂質</th>
                                <th className="px-2 py-2 text-right w-20">炭水化物</th>
                                <th className="px-2 py-2 text-right w-20">食塩</th>
                                <th className="px-2 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredIngredients.length === 0 ? (
                                <tr><td colSpan={12} className="text-center py-8 text-gray-500">データがありません</td></tr>
                            ) : (
                                filteredIngredients.map((ing, index) => (
                                    <tr key={ing.id} className={`border-b hover:bg-gray-50 ${ing.isNew ? 'bg-green-50' : ''} ${ing.isModified && !ing.isNew ? 'bg-yellow-50' : ''}`}>
                                        <td className="px-2 py-1 text-gray-500">{index + 1}</td>
                                        <td className="px-0 py-1">
                                            <div className="flex items-center gap-1.5">
                                                {renderEditableCell(ing, 'name', ing.name, 'ingredient', 'min-w-[180px]')}
                                                {renderRecipeUsageButton(ing.name, recipeUsageByIngredient[ing.id])}
                                                {ing.raw_materials && (
                                                    <button
                                                        onClick={() => openEditModal(ing)}
                                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 whitespace-nowrap hover:bg-emerald-200 transition cursor-pointer"
                                                        title={`原材料: ${ing.raw_materials}`}
                                                    >
                                                        <FlaskConical className="w-3 h-3" />
                                                        原材料済
                                                    </button>
                                                )}
                                                {ing.label_images && ing.label_images.length > 0 && (
                                                    <button
                                                        onClick={() => setLabelPreview({ name: ing.name, images: ing.label_images! })}
                                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 whitespace-nowrap hover:bg-blue-200 transition cursor-pointer"
                                                        title="ラベル画像を表示"
                                                    >
                                                        <Camera className="w-3 h-3" />
                                                        {ing.label_images.length}枚
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 text-center">
                                            <button
                                                onClick={() => handleTaxToggle(ing.id, !!ing.tax_included, 'ingredient')}
                                                className={`text-[10px] px-2 py-0.5 rounded font-bold transition ${ing.tax_included ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}
                                            >
                                                {ing.tax_included ? '税込' : '税抜'}
                                            </button>
                                        </td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'unit_quantity', formatNumber(ing.unit_quantity, 0), 'ingredient')}</td>
                                        <td className="px-0 py-1 text-right">
                                            {priceInputIncludesTax
                                                ? renderCalculatedPrice(recipePriceForDisplay(ing.price, false, ing.tax_included !== false, taxRates.ingredient))
                                                : renderEditableCell(ing, 'price', ing.price != null ? `¥${formatRecipePrice(recipePriceForDisplay(ing.price, false, ing.tax_included !== false, taxRates.ingredient))}` : '-', 'ingredient')}
                                        </td>
                                        <td className="px-0 py-1 text-right">
                                            {priceInputIncludesTax
                                                ? renderEditableCell(ing, 'price_tax_included', ing.price != null ? `¥${formatRecipePrice(recipePriceForDisplay(ing.price, true, ing.tax_included !== false, taxRates.ingredient))}` : '-', 'ingredient')
                                                : renderCalculatedPrice(recipePriceForDisplay(ing.price, true, ing.tax_included !== false, taxRates.ingredient))}
                                        </td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'calories', formatNumber(ing.calories, 1), 'ingredient')}</td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'protein', formatNumber(ing.protein, 1), 'ingredient')}</td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'fat', formatNumber(ing.fat, 1), 'ingredient')}</td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'carbohydrate', formatNumber(ing.carbohydrate, 1), 'ingredient')}</td>
                                        <td className="px-0 py-1 text-right">{renderEditableCell(ing, 'sodium', formatNumber(ing.sodium, 2), 'ingredient')}</td>
                                        <td className="px-2 py-1">
                                            <div className="flex items-center gap-0.5">
                                                <Button variant="ghost" size="sm" onClick={() => openEditModal(ing)} className="h-6 w-6 p-0 text-gray-400 hover:text-blue-500" title="編集">
                                                    <Pencil className="w-3 h-3" />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => duplicateIngredient(ing)} className="h-6 w-6 p-0 text-gray-400 hover:text-green-500" title="コピー">
                                                    <Copy className="w-3 h-3" />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => deleteIngredient(ing.id)} className="h-6 w-6 p-0 text-gray-400 hover:text-red-500" title="削除">
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                ) : activeTab === "materials" ? (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-100 z-10">
                            <tr className="border-b">
                                <th className="px-2 py-2 text-left w-10">NO</th>
                                <th className="px-2 py-2 text-left min-w-[250px]">資材名</th>
                                <th className="px-2 py-2 text-center w-20">税込設定</th>
                                <th className="px-2 py-2 text-left w-40">入数</th>
                                <th className={`px-2 py-2 text-right w-28 ${priceInputIncludesTax ? "" : "bg-blue-50 text-blue-800"}`}>税別単価<br /><span className="text-[10px] font-normal">{priceInputIncludesTax ? "自動計算" : "入力"}</span></th>
                                <th className={`px-2 py-2 text-right w-28 ${priceInputIncludesTax ? "bg-blue-50 text-blue-800" : ""}`}>税込単価<br /><span className="text-[10px] font-normal">{priceInputIncludesTax ? "入力" : "自動計算"}</span></th>
                                <th className="px-2 py-2 text-left w-28">仕入先</th>
                                <th className="px-2 py-2 text-left w-40">備考</th>
                                <th className="px-2 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMaterials.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-8 text-gray-500">データがありません</td></tr>
                            ) : (
                                filteredMaterials.map((mat, index) => (
                                    <tr key={mat.id} className={`border-b hover:bg-gray-50 ${mat.isNew ? 'bg-green-50' : ''} ${mat.isModified && !mat.isNew ? 'bg-yellow-50' : ''}`}>
                                        <td className="px-2 py-1 text-gray-500">{index + 1}</td>
                                        <td className="px-0 py-1">
                                            <div className="flex items-center gap-1.5">
                                                {renderEditableCell(mat, 'name', mat.name, 'material', 'min-w-[230px]')}
                                                {renderRecipeUsageButton(mat.name, recipeUsageByMaterial[mat.id])}
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 text-center">
                                            <button
                                                onClick={() => handleTaxToggle(mat.id, !!mat.tax_included, 'material')}
                                                className={`text-[10px] px-2 py-0.5 rounded font-bold transition ${mat.tax_included ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}
                                            >
                                                {mat.tax_included ? '税込' : '税抜'}
                                            </button>
                                        </td>
                                        <td className="px-0 py-1">{renderEditableCell(mat, 'unit_quantity', mat.unit_quantity || '', 'material', 'w-36')}</td>
                                        <td className="px-0 py-1 text-right">
                                            {priceInputIncludesTax
                                                ? renderCalculatedPrice(recipePriceForDisplay(mat.price, false, mat.tax_included !== false, taxRates.material))
                                                : renderEditableCell(mat, 'price', mat.price != null ? `¥${formatRecipePrice(recipePriceForDisplay(mat.price, false, mat.tax_included !== false, taxRates.material))}` : '-', 'material')}
                                        </td>
                                        <td className="px-0 py-1 text-right">
                                            {priceInputIncludesTax
                                                ? renderEditableCell(mat, 'price_tax_included', mat.price != null ? `¥${formatRecipePrice(recipePriceForDisplay(mat.price, true, mat.tax_included !== false, taxRates.material))}` : '-', 'material')
                                                : renderCalculatedPrice(recipePriceForDisplay(mat.price, true, mat.tax_included !== false, taxRates.material))}
                                        </td>
                                        <td className="px-0 py-1">{renderEditableCell(mat, 'supplier', mat.supplier || '', 'material', 'w-24')}</td>
                                        <td className="px-0 py-1">{renderEditableCell(mat, 'notes', mat.notes || '', 'material', 'w-36')}</td>
                                        <td className="px-2 py-1">
                                            <div className="flex items-center gap-0.5">
                                                <button
                                                    onClick={() => moveItem(mat.id, 'materials', 'expenses')}
                                                    className="text-[9px] px-1.5 py-0.5 rounded border border-orange-200 text-orange-600 hover:bg-orange-50 whitespace-nowrap"
                                                    title="諸経費に移動"
                                                >
                                                    →諸経費
                                                </button>
                                                <Button variant="ghost" size="sm" onClick={() => duplicateMaterial(mat)} className="h-6 w-6 p-0 text-gray-400 hover:text-green-500" title="コピー">
                                                    <Copy className="w-3 h-3" />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => deleteMaterial(mat.id)} className="h-6 w-6 p-0 text-gray-400 hover:text-red-500" title="削除">
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                ) : activeTab === "expense" ? (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-100 z-10">
                            <tr className="border-b">
                                <th className="px-2 py-2 text-left w-10">NO</th>
                                <th className="px-2 py-2 text-left min-w-[250px]">経費名</th>
                                <th className="px-2 py-2 text-center w-20">税込設定</th>
                                <th className="px-2 py-2 text-right w-28 bg-blue-50 text-blue-800">{priceInputIncludesTax ? "税込単価" : "税別単価"}<br /><span className="text-[10px] font-normal">入力</span></th>
                                <th className="px-2 py-2 text-left w-40">備考</th>
                                <th className="px-2 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredExpenses.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-8 text-gray-500">データがありません</td></tr>
                            ) : (
                                filteredExpenses.map((exp, index) => (
                                    <tr key={exp.id} className="border-b hover:bg-gray-50">
                                        <td className="px-2 py-1 text-gray-500">{index + 1}</td>
                                        <td className="px-0 py-1">{renderEditableCell(exp, 'name', exp.name, 'expense', 'min-w-[230px]')}</td>
                                        <td className="px-2 py-1 text-center">
                                            <button
                                                onClick={() => handleTaxToggle(exp.id, !!exp.tax_included, 'expense')}
                                                className={`text-[10px] px-2 py-0.5 rounded font-bold transition ${exp.tax_included ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}
                                            >
                                                {exp.tax_included ? '税込' : '税抜'}
                                            </button>
                                        </td>
                                        <td className="px-0 py-1 text-right">
                                            {renderEditableCell(
                                                exp,
                                                priceInputIncludesTax ? 'unit_price_tax_included' : 'unit_price',
                                                exp.unit_price != null
                                                    ? `¥${formatRecipePrice(recipePriceForDisplay(exp.unit_price, priceInputIncludesTax, exp.tax_included !== false, taxRates.material))}`
                                                    : '-',
                                                'expense',
                                            )}
                                        </td>
                                        <td className="px-0 py-1">{renderEditableCell(exp, 'notes', exp.notes || '', 'expense', 'w-36')}</td>
                                        <td className="px-2 py-1">
                                            <div className="flex items-center gap-0.5">
                                                <button
                                                    onClick={() => moveItem(exp.id, 'expenses', 'materials')}
                                                    className="text-[9px] px-1.5 py-0.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 whitespace-nowrap"
                                                    title="資材に移動"
                                                >
                                                    →資材
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-100 z-10">
                            <tr className="border-b">
                                <th className="px-2 py-2 text-left w-10">NO</th>
                                <th className="px-2 py-2 text-left min-w-[300px]">中間部品名</th>
                                <th className="px-2 py-2 text-left w-28">カテゴリ</th>
                                <th className="px-2 py-2 text-right w-24">価格</th>
                                <th className="px-2 py-2 text-left w-40">ソースファイル</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredIntermediates.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-8 text-gray-500">データがありません</td></tr>
                            ) : (
                                filteredIntermediates.map((item, index) => (
                                    <tr
                                        key={item.id}
                                        className="border-b hover:bg-gray-50 cursor-pointer"
                                        onClick={() => router.push(`/recipe/${item.id}`)}
                                    >
                                        <td className="px-2 py-1 text-gray-500">{index + 1}</td>
                                        <td className="px-2 py-1 font-medium">{item.name}</td>
                                        <td className="px-2 py-1">
                                            <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                                                {item.category}
                                            </span>
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            {item.selling_price ? `¥${item.selling_price.toLocaleString()}` : '-'}
                                        </td>
                                        <td className="px-2 py-1 text-xs text-gray-500 truncate max-w-[200px]">
                                            {item.source_file?.replace("【重要】【製造】総合管理（新型）", "").replace(".xlsx", "") || "-"}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* 食材編集モーダル */}
            {recipeUsagePopover && (
                <div
                    className="fixed z-40 w-[380px] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
                    style={{ left: recipeUsagePopover.left, top: recipeUsagePopover.top }}
                    onMouseEnter={keepRecipeUsagePopover}
                    onMouseLeave={hideRecipeUsagePopoverSoon}
                >
                    <div className="border-b border-slate-200 bg-slate-900 px-3 py-2 text-white">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-100">
                                    <BookOpen className="h-3 w-3" />
                                    使用レシピ
                                </div>
                                <div className="truncate text-xs font-bold">{recipeUsagePopover.title}</div>
                            </div>
                            <div className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold">
                                {recipeUsagePopover.usages.length}件
                            </div>
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                        {recipeUsagePopover.usages.map((usage, index) => (
                            <div key={`${usage.recipeId}-${index}`} className="border-b border-slate-100 px-3 py-1.5 last:border-b-0">
                                <div className="flex items-start gap-2">
                                    <span className="mt-0.5 max-w-[72px] shrink-0 truncate rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                                        {usage.category || (usage.isIntermediate ? "中間品" : "未分類")}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-[11px] font-semibold leading-4 text-slate-900">
                                            {usage.recipeName}
                                        </div>
                                        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-4 text-slate-500">
                                            {usage.totalUsage !== null && (
                                                <span>使用量 {formatCompactValue(usage.totalUsage)}</span>
                                            )}
                                            {usage.totalCost !== null && (
                                                <span>原価 ¥{formatCompactValue(usage.totalCost)}</span>
                                            )}
                                            {usage.itemCount > 1 && (
                                                <span>{usage.itemCount}行</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {editModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 rounded-t-xl">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{editModal.name}</h3>
                                <p className="text-xs text-gray-500">食材詳細編集</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setEditModal(null)} className="h-8 w-8 p-0">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            {/* 価格・入数フィールド */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                        <label className="text-sm font-medium text-gray-700">単価（{priceInputIncludesTax ? "税込" : "税別"}）</label>
                                        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-600">
                                            <Checkbox
                                                checked={priceInputIncludesTax}
                                                onCheckedChange={(checked) => changePriceInputMode(checked === true)}
                                                aria-label="税込金額から税別単価を計算"
                                            />
                                            税込から計算
                                        </label>
                                    </div>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        value={editForm['price'] || ''}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, price: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        placeholder={priceInputIncludesTax ? "税込金額を入力" : "税別金額を入力"}
                                    />
                                    {editForm.price && Number.isFinite(Number(editForm.price)) && (
                                        <p className="mt-1 text-xs text-blue-700">
                                            {priceInputIncludesTax ? "税別換算" : "税込換算"}: ¥{formatRecipePrice(convertRecipePrice(
                                                Number(editForm.price),
                                                priceInputIncludesTax,
                                                !priceInputIncludesTax,
                                                taxRates.ingredient,
                                            ))}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">入数(g)</label>
                                    <input
                                        type="number"
                                        value={editForm['unit_quantity'] || ''}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, unit_quantity: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="例: 1000"
                                    />
                                </div>
                            </div>
                            {[
                                { key: 'raw_materials', label: '原材料', rows: 4 },
                                { key: 'allergens', label: 'アレルゲン', rows: 2 },
                                { key: 'origin', label: '原産地', rows: 1 },
                                { key: 'manufacturer', label: '製造者', rows: 1 },
                                { key: 'product_description', label: '商品説明', rows: 2 },
                                { key: 'nutrition_per', label: '栄養成分基準量', rows: 1 },
                            ].map(({ key, label, rows }) => (
                                <div key={key}>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                                    {rows > 1 ? (
                                        <textarea
                                            value={editForm[key] || ''}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                                            rows={rows}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                            placeholder={`${label}を入力...`}
                                        />
                                    ) : (
                                        <input
                                            type="text"
                                            value={editForm[key] || ''}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder={`${label}を入力...`}
                                        />
                                    )}
                                </div>
                            ))}
                            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="inline-flex items-center gap-2 text-sm font-bold text-blue-900">
                                        <Camera className="w-4 h-4" />
                                        ラベル画像
                                    </div>
                                    {editModal.label_images && editModal.label_images.length > 0 && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setLabelPreview({ name: editModal.name, images: editModal.label_images! })}
                                            className="h-8 text-xs"
                                        >
                                            大きく表示
                                        </Button>
                                    )}
                                </div>
                                {editModal.label_images && editModal.label_images.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {editModal.label_images.map((img, i) => (
                                            <button
                                                key={`${img.type}-${i}`}
                                                type="button"
                                                onClick={() => setLabelPreview({ name: editModal.name, images: editModal.label_images! })}
                                                className="text-left rounded-lg border border-blue-100 bg-white overflow-hidden hover:border-blue-300 hover:shadow-sm transition"
                                            >
                                                <div className="px-2 py-1.5 bg-white border-b flex items-center justify-between gap-2">
                                                    <span className="text-xs font-medium text-gray-700 truncate">
                                                        {labelImageTypeLabels[img.type] || img.type}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 shrink-0">
                                                        {new Date(img.uploaded_at).toLocaleDateString("ja-JP")}
                                                    </span>
                                                </div>
                                                <img
                                                    src={img.url}
                                                    alt={labelImageTypeLabels[img.type] || img.type}
                                                    className="w-full h-32 object-contain bg-white"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-dashed border-blue-200 bg-white px-3 py-4 text-sm text-gray-500">
                                        保存済みのラベル画像はありません。
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-xl">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const fields = [
                                        {k:'raw_materials',l:'原材料'},
                                        {k:'allergens',l:'アレルゲン'},
                                        {k:'origin',l:'原産地'},
                                        {k:'manufacturer',l:'製造者'},
                                        {k:'product_description',l:'商品説明'},
                                        {k:'nutrition_per',l:'栄養成分基準量'},
                                    ];
                                    const html = `<html><head><title>${editModal.name} - 食材情報</title>
                                        <style>
                                            body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 24px; color: #1a1a1a; }
                                            h2 { font-size: 20px; margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 8px; }
                                            .field { margin-bottom: 12px; }
                                            .field-label { font-size: 11px; font-weight: bold; color: #666; margin-bottom: 2px; }
                                            .field-value { font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
                                            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
                                            @media print { body { padding: 0; } }
                                        </style></head><body>
                                        <h2>${editModal.name}</h2>
                                        <div class="grid">
                                            <div class="field"><div class="field-label">単価（${priceInputIncludesTax ? '税込' : '税別'}入力）</div><div class="field-value">${editForm['price'] || '-'} 円</div></div>
                                            <div class="field"><div class="field-label">入数</div><div class="field-value">${editForm['unit_quantity'] || '-'} g</div></div>
                                        </div>
                                        ${fields.map(f => `<div class="field"><div class="field-label">${f.l}</div><div class="field-value">${(editForm[f.k] || '-').replace(/</g, '&lt;')}</div></div>`).join('')}
                                        </body></html>`;
                                    // hidden iframe 方式（ポップアップブロッカー回避）
                                    let iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
                                    if (!iframe) {
                                        iframe = document.createElement('iframe');
                                        iframe.id = 'print-iframe';
                                        iframe.style.position = 'fixed';
                                        iframe.style.left = '-9999px';
                                        iframe.style.top = '-9999px';
                                        iframe.style.width = '0';
                                        iframe.style.height = '0';
                                        document.body.appendChild(iframe);
                                    }
                                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                                    if (!doc) return;
                                    doc.open();
                                    doc.write(html);
                                    doc.close();
                                    setTimeout(() => {
                                        iframe.contentWindow?.focus();
                                        iframe.contentWindow?.print();
                                    }, 200);
                                }}
                                className="gap-2"
                            >
                                <Printer className="w-4 h-4" />
                                印刷
                            </Button>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setEditModal(null)}>キャンセル</Button>
                                <Button onClick={saveEditModal} className="bg-blue-600 hover:bg-blue-700 text-white">
                                    <Save className="w-4 h-4 mr-2" />
                                    保存
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ラベル画像プレビューモーダル */}
            {labelPreview && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setLabelPreview(null)}>
                    <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">📷 ラベル画像</h3>
                                <p className="text-sm text-gray-500">{labelPreview.name}</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setLabelPreview(null)}>
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {labelPreview.images.map((img, i) => {
                                const typeLabels: Record<string, string> = {
                                    front_label: "🏷️ 表ラベル",
                                    ingredients_label: "📋 原材料表示",
                                    nutrition_label: "🧪 栄養成分表示",
                                };
                                return (
                                    <div key={i} className="border rounded-lg overflow-hidden">
                                        <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
                                            <span className="text-sm font-medium">{typeLabels[img.type] || img.type}</span>
                                            <span className="text-[10px] text-gray-400">
                                                {new Date(img.uploaded_at).toLocaleDateString('ja-JP')}
                                            </span>
                                        </div>
                                        <img
                                            src={img.url}
                                            alt={img.type}
                                            className="w-full object-contain max-h-[400px] bg-white"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
