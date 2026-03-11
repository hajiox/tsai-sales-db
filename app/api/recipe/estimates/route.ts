import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY || "";

// --- AI マッチング: Gemini 2.0 Flash で見積書品目と既存材料の対応を推定 ---
async function aiMatchItems(
    estimateItems: { id: string; item_name: string; counterparty_name: string | null }[],
    allItems: { id: string; name: string; price: number | null; type: string }[]
): Promise<Record<string, { ingredientId: string; ingredientName: string; confidence: number }>> {
    if (!geminiApiKey || allItems.length === 0 || estimateItems.length === 0) return {};

    const ingList = allItems.map(i => `${i.id}|${i.name}|${i.type}`).join("\n");
    const itemList = estimateItems.map(i => `${i.id}|${i.item_name}`).join("\n");

    const prompt = `あなたは食品・資材の材料マスターマッチングAIです。
見積書の品目名と、既存の材料マスター（食材+資材）名を比較して、同じものをマッチングしてください。

【既存材料マスター】(ID|名前|種別)
${ingList}

【見積書品目】(ID|品名)
${itemList}

【ルール】
- 段ボール・箱・パック等の梱包資材は「material」種別のマスターとマッチさせること
- 食材は「ingredient」種別のマスターとマッチさせること
- 完全一致でなくても、明らかに同じものなら対応させる
- ブランド名・容量・規格・サイズの違いは許容する
- 確信度を0.0〜1.0で返す（0.9以上=ほぼ確実、0.5-0.8=可能性あり）
- マッチなしの品目は出力しない

【出力形式】JSON配列のみ（説明不要）
[{"estimateId":"...","ingredientId":"...","ingredientName":"...","confidence":0.8}]`;

    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
                }),
            }
        );
        if (!res.ok) {
            console.error("[AI Match] API error:", res.status);
            return {};
        }
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // JSON抽出
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return {};

        const matches: { estimateId: string; ingredientId: string; ingredientName: string; confidence: number }[] =
            JSON.parse(jsonMatch[0]);

        const result: Record<string, { ingredientId: string; ingredientName: string; confidence: number }> = {};
        for (const m of matches) {
            result[m.estimateId] = {
                ingredientId: m.ingredientId,
                ingredientName: m.ingredientName,
                confidence: m.confidence,
            };
        }
        return result;
    } catch (e) {
        console.error("[AI Match] error:", e);
        return {};
    }
}

// GET: pending_estimate_items 取得 + AI マッチング
export async function GET(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";

    const { data, error } = await supabase
        .from("pending_estimate_items")
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // pending件数
    const { count } = await supabase
        .from("pending_estimate_items")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

    // 既存材料マスター（食材 + 資材の両方を取得）
    const [ingredientsRes, materialsRes] = await Promise.all([
        supabase.from("ingredients").select("id, name, price, unit_quantity").order("name").limit(1000),
        supabase.from("materials").select("id, name, price, unit_quantity").order("name").limit(500),
    ]);

    if (ingredientsRes.error) {
        console.error("[estimates API] ingredients取得エラー:", ingredientsRes.error.message);
    }
    if (materialsRes.error) {
        console.error("[estimates API] materials取得エラー:", materialsRes.error.message);
    }

    // type付きで統合リストを作成
    const allItems = [
        ...(ingredientsRes.data || []).map((i: any) => ({ ...i, type: "ingredient" })),
        ...(materialsRes.data || []).map((m: any) => ({ ...m, type: "material" })),
    ];

    // AI マッチング（pendingの場合のみ、マッチ未済の品目に対して実行）
    let aiMatches: Record<string, { ingredientId: string; ingredientName: string; confidence: number }> = {};
    if (status === "pending" && data && data.length > 0 && allItems.length > 0) {
        const unmatchedItems = data
            .filter((item: any) => !item.matched_ingredient_id)
            .map((item: any) => ({
                id: item.id,
                item_name: item.item_name,
                counterparty_name: item.counterparty_name,
            }));

        if (unmatchedItems.length > 0) {
            aiMatches = await aiMatchItems(unmatchedItems, allItems);

            // マッチ結果をDBに保存（次回以降は再計算不要）
            for (const [itemId, match] of Object.entries(aiMatches)) {
                await supabase
                    .from("pending_estimate_items")
                    .update({
                        matched_ingredient_id: match.ingredientId,
                        matched_ingredient_name: match.ingredientName,
                        match_confidence: match.confidence,
                    })
                    .eq("id", itemId);
            }

            // dataにもマッチ結果を反映
            for (const item of data as any[]) {
                if (aiMatches[item.id]) {
                    item.matched_ingredient_id = aiMatches[item.id].ingredientId;
                    item.matched_ingredient_name = aiMatches[item.id].ingredientName;
                    item.match_confidence = aiMatches[item.id].confidence;
                }
            }
        }
    }

    return NextResponse.json({
        items: data,
        pendingCount: count || 0,
        ingredients: allItems,
    });
}

// PATCH: 見積もり項目に対するアクション
export async function PATCH(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();
    const { action, itemId, ingredientId, newIngredientData } = body;
    // targetTable: "ingredient" or "material" (デフォルトはingredient)
    const targetTable = body.targetTable === "material" ? "materials" : "ingredients";

    if (!itemId || !action) {
        return NextResponse.json({ error: "itemId and action are required" }, { status: 400 });
    }

    const { data: item, error: fetchErr } = await supabase
        .from("pending_estimate_items")
        .select("*")
        .eq("id", itemId)
        .single();

    if (fetchErr || !item) {
        return NextResponse.json({ error: "項目が見つかりません" }, { status: 404 });
    }

    try {
        if (action === "update_price") {
            if (!ingredientId) return NextResponse.json({ error: "ingredientId is required" }, { status: 400 });

            const updateData: any = {};
            if (item.unit_price != null) {
                updateData.price = item.unit_price;
            }

            if (Object.keys(updateData).length > 0) {
                // 選択先のテーブル（ingredients or materials）を更新
                const { error: updateErr } = await supabase
                    .from(targetTable)
                    .update(updateData)
                    .eq("id", ingredientId);
                if (updateErr) {
                    // フォールバック: もう片方のテーブルも試す
                    const fallbackTable = targetTable === "ingredients" ? "materials" : "ingredients";
                    const { error: fallbackErr } = await supabase
                        .from(fallbackTable)
                        .update(updateData)
                        .eq("id", ingredientId);
                    if (fallbackErr) throw updateErr;
                }
            }

            await supabase
                .from("pending_estimate_items")
                .update({
                    status: "applied",
                    applied_action: "price_updated",
                    applied_at: new Date().toISOString(),
                    matched_ingredient_id: ingredientId,
                })
                .eq("id", itemId);

            return NextResponse.json({ success: true, action: "price_updated" });
        }

        if (action === "create_new") {
            const itemData: any = {
                name: newIngredientData?.name || item.item_name,
                unit_quantity: newIngredientData?.unit_quantity || 1,
                price: item.unit_price || item.amount,
            };

            const { data: newItem, error: insertErr } = await supabase
                .from(targetTable)
                .insert(itemData)
                .select()
                .single();

            if (insertErr) throw insertErr;

            await supabase
                .from("pending_estimate_items")
                .update({
                    status: "applied",
                    applied_action: "created_new",
                    applied_at: new Date().toISOString(),
                    matched_ingredient_id: newItem.id,
                })
                .eq("id", itemId);

            return NextResponse.json({ success: true, action: "created_new", ingredientId: newItem.id });
        }

        if (action === "reject" || action === "skip") {
            await supabase
                .from("pending_estimate_items")
                .update({
                    status: action === "reject" ? "rejected" : "skipped",
                    applied_at: new Date().toISOString(),
                    notes: body.notes || null,
                })
                .eq("id", itemId);

            return NextResponse.json({ success: true, action });
        }

        return NextResponse.json({ error: "不明なaction" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
