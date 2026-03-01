// app/recipe/series/page.tsx
// シリーズマスター管理ページ

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Trash2, Save, Edit2, X, Check } from "lucide-react";
import { toast } from "sonner";
import type { SeriesItem } from "@/lib/series-list";

export default function SeriesManagementPage() {
    const router = useRouter();
    const [seriesList, setSeriesList] = useState<(SeriesItem & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editCode, setEditCode] = useState("");
    const [editName, setEditName] = useState("");
    const [newCode, setNewCode] = useState("");
    const [newName, setNewName] = useState("");
    const [adding, setAdding] = useState(false);

    const fetchSeries = async () => {
        try {
            const res = await fetch("/api/series");
            const { data } = await res.json();
            setSeriesList(data || []);
        } catch {
            toast.error("シリーズの取得に失敗しました");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSeries();
    }, []);

    const handleAdd = async () => {
        const code = parseInt(newCode);
        if (!code || !newName.trim()) {
            toast.error("番号と名前を入力してください");
            return;
        }
        if (seriesList.some((s) => s.code === code)) {
            toast.error("この番号は既に使われています");
            return;
        }

        try {
            const res = await fetch("/api/series", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, name: newName.trim() }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
            toast.success("シリーズを追加しました");
            setNewCode("");
            setNewName("");
            setAdding(false);
            fetchSeries();
        } catch (error: any) {
            toast.error(`追加に失敗: ${error.message}`);
        }
    };

    const handleUpdate = async (id: string) => {
        const code = parseInt(editCode);
        if (!code || !editName.trim()) {
            toast.error("番号と名前を入力してください");
            return;
        }

        try {
            const res = await fetch("/api/series", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, code, name: editName.trim() }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
            toast.success("シリーズを更新しました（レシピ・商品も連動更新）");
            setEditingId(null);
            fetchSeries();
        } catch (error: any) {
            toast.error(`更新に失敗: ${error.message}`);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`「${name}」を削除しますか？\n※ 既存のレシピ・商品のシリーズ情報は残ります`)) return;

        try {
            const res = await fetch(`/api/series?id=${id}`, { method: "DELETE" });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
            toast.success("シリーズを削除しました");
            fetchSeries();
        } catch (error: any) {
            toast.error(`削除に失敗: ${error.message}`);
        }
    };

    const startEdit = (item: SeriesItem & { id: string }) => {
        setEditingId(item.id);
        setEditCode(String(item.code));
        setEditName(item.name);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen text-gray-400">
                読み込み中...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white text-gray-800 font-sans">
            <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b px-6 py-3 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/recipe")}
                        className="text-gray-500 hover:text-gray-900"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        レシピ一覧
                    </Button>
                    <h1 className="text-lg font-bold">シリーズマスター管理</h1>
                </div>
                <Button
                    size="sm"
                    onClick={() => setAdding(!adding)}
                    className="gap-2"
                >
                    <Plus className="w-4 h-4" />
                    新規追加
                </Button>
            </header>

            <main className="max-w-[800px] mx-auto p-8">
                <div className="mb-4 text-sm text-gray-500">
                    シリーズの追加・編集・削除ができます。名前変更時はレシピ・商品マスターも自動で連動更新されます。
                </div>

                {/* 新規追加フォーム */}
                {adding && (
                    <div className="mb-6 p-4 border-2 border-blue-200 rounded-lg bg-blue-50/50">
                        <div className="text-sm font-bold text-blue-700 mb-3">新規シリーズ追加</div>
                        <div className="flex gap-3 items-end">
                            <div>
                                <label className="text-xs font-bold text-gray-500 block mb-1">番号</label>
                                <Input
                                    type="number"
                                    placeholder="26"
                                    value={newCode}
                                    onChange={(e) => setNewCode(e.target.value)}
                                    className="w-20 h-9"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs font-bold text-gray-500 block mb-1">シリーズ名</label>
                                <Input
                                    placeholder="新しいシリーズ名"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="h-9"
                                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                                />
                            </div>
                            <Button size="sm" onClick={handleAdd} className="h-9 gap-1">
                                <Check className="w-4 h-4" />
                                追加
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setAdding(false)} className="h-9">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}

                {/* シリーズ一覧テーブル */}
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b-2 border-gray-800 text-gray-500">
                            <th className="py-2 text-left w-20 font-bold">番号</th>
                            <th className="py-2 text-left font-bold">シリーズ名</th>
                            <th className="py-2 text-right w-24 font-bold">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {seriesList.map((item) => (
                            <tr
                                key={item.id}
                                className="hover:bg-gray-50 transition-colors group"
                            >
                                {editingId === item.id ? (
                                    <>
                                        <td className="py-2">
                                            <Input
                                                type="number"
                                                value={editCode}
                                                onChange={(e) => setEditCode(e.target.value)}
                                                className="w-16 h-8 text-sm"
                                            />
                                        </td>
                                        <td className="py-2">
                                            <Input
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="h-8 text-sm"
                                                onKeyDown={(e) => e.key === "Enter" && handleUpdate(item.id)}
                                            />
                                        </td>
                                        <td className="py-2 text-right">
                                            <div className="flex gap-1 justify-end">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 w-7 p-0 text-green-600 hover:text-green-800 hover:bg-green-50"
                                                    onClick={() => handleUpdate(item.id)}
                                                >
                                                    <Check className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                                                    onClick={() => setEditingId(null)}
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="py-2 font-mono font-bold text-gray-600">
                                            {item.code}
                                        </td>
                                        <td className="py-2 font-medium text-gray-900">
                                            {item.name}
                                        </td>
                                        <td className="py-2 text-right">
                                            <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 w-7 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                                    onClick={() => startEdit(item)}
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                                                    onClick={() => handleDelete(item.id, item.name)}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="mt-6 text-xs text-gray-400 font-mono">
                    合計: {seriesList.length} シリーズ
                </div>
            </main>
        </div>
    );
}
