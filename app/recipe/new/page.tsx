// app/recipe/new/page.tsx
// 新規レシピ作成 → 空レシピをDB作成して詳細ページにリダイレクト

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function NewRecipePage() {
    const router = useRouter();
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        const createAndRedirect = async () => {
            if (creating) return;
            setCreating(true);

            try {
                const res = await fetch('/api/recipe/db-write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        operation: 'insert',
                        table: 'recipes',
                        data: {
                            name: '新規レシピ',
                            category: 'ネット専用',
                            is_intermediate: false,
                            total_cost: 0,
                        }
                    }),
                });
                const result = await res.json();
                if (!res.ok) throw new Error(result.error || '作成に失敗しました');

                // 詳細ページにリダイレクト
                router.replace(`/recipe/${result.data.id}`);
            } catch (error: any) {
                console.error("Create error:", error);
                toast.error(`レシピの作成に失敗しました: ${error?.message || error}`);
                router.push('/recipe');
            }
        };

        createAndRedirect();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="flex justify-center items-center h-screen text-gray-400">
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-4"></div>
                新規レシピを作成中...
            </div>
        </div>
    );
}
