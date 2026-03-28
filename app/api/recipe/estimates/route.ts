import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY || "";

// --- AI マッチング: Gemini 2.0 Flash で見積書品目と既存材料の対応を推定 ---
// バッチ処理: 品目を10件ずつに分割して処理
async function aiMatchItems(
    estimateItems: { id: string; item_name: string; counterparty_name: string | null }[],
    allItems: { id: string; name: string; price: number | null; type: string }[]
): Promise<Record<string, { ingredientId: string; ingredientName: string; confidence: number }>> {
    if (!geminiApiKey || allItems.length === 0 || estimateItems.length === 0) return {};

    // UUID→短縮IDのマップ（トークン節約）
    const idMap = new Map<string, string>();
    const reverseIdMap = new Map<string, string>();
    allItems.forEach((item, idx) => {
        const shortId = `M${idx}`;
        idMap.set(item.id, shortId);
        reverseIdMap.set(shortId, item.id);
    });

    // マスターリストを短縮IDで作成
    const ingList = allItems.map(i => `${idMap.get(i.id)}|${i.name}|${i.type}`).join("\n");

    const result: Record<string, { ingredientId: string; ingredientName: string; confidence: number }> = {};

    // 10件ずつバッチ処理
    const BATCH_SIZE = 10;
    for (let i = 0; i < estimateItems.length; i += BATCH_SIZE) {
        const batch = estimateItems.slice(i, i + BATCH_SIZE);
        // 品目側も短縮ID
        const itemIdMap = new Map<string, string>();
        const itemReverseMap = new Map<string, string>();
        batch.forEach((item, idx) => {
            const shortId = `E${i + idx}`;
            itemIdMap.set(item.id, shortId);
            itemReverseMap.set(shortId, item.id);
        });
        const itemList = batch.map(it => `${itemIdMap.get(it.id)}|${it.item_name}`).join("\n");

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
[{"estimateId":"E0","ingredientId":"M5","ingredientName":"名前","confidence":0.8}]`;

        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
                    }),
                }
            );
            if (!res.ok) {
                console.error(`[AI Match] API error (batch ${i}):`, res.status);
                continue;
            }
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) continue;

            const matches: { estimateId: string; ingredientId: string; ingredientName: string; confidence: number }[] =
                JSON.parse(jsonMatch[0]);

            for (const m of matches) {
                // 短縮IDから元のUUIDを復元
                const realEstimateId = itemReverseMap.get(m.estimateId) || m.estimateId;
                const realIngredientId = reverseIdMap.get(m.ingredientId) || m.ingredientId;
                result[realEstimateId] = {
                    ingredientId: realIngredientId,
                    ingredientName: m.ingredientName,
                    confidence: m.confidence,
                };
            }
        } catch (e) {
            console.error(`[AI Match] batch ${i} error:`, e);
        }
    }

    return result;
}

// Vercel関数タイムアウト延長（AIマッチングに時間がかかるため）
export const maxDuration = 60;


// GET: pending_estimate_items 取得（高速・DB読み取りのみ）
export async function GET(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";

    // 「rejected」タブでは skipped と rejected の両方を取得
    let query = supabase
        .from("pending_estimate_items")
        .select("*")
        .order("created_at", { ascending: false });

    if (status === "rejected") {
        query = query.in("status", ["rejected", "skipped"]);
    } else {
        query = query.eq("status", status);
    }

    const { data, error } = await query;

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

    // type付きで統合リストを作成
    const allItems = [
        ...(ingredientsRes.data || []).map((i: any) => ({ ...i, type: "ingredient" })),
        ...(materialsRes.data || []).map((m: any) => ({ ...m, type: "material" })),
    ];

    return NextResponse.json({
        items: data,
        pendingCount: count || 0,
        ingredients: allItems,
    });
}

// POST: AIマッチングを実行（明示的に呼び出し）
export async function POST(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 未マッチのpending品目を取得
    const { data, error } = await supabase
        .from("pending_estimate_items")
        .select("id, item_name, counterparty_name")
        .eq("status", "pending")
        .is("matched_ingredient_id", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) {
        return NextResponse.json({ matched: 0, message: "マッチ対象なし" });
    }

    // 既存材料マスター取得
    const [ingredientsRes, materialsRes] = await Promise.all([
        supabase.from("ingredients").select("id, name, price, unit_quantity").order("name").limit(1000),
        supabase.from("materials").select("id, name, price, unit_quantity").order("name").limit(500),
    ]);

    const allItems = [
        ...(ingredientsRes.data || []).map((i: any) => ({ ...i, type: "ingredient" })),
        ...(materialsRes.data || []).map((m: any) => ({ ...m, type: "material" })),
    ];

    if (allItems.length === 0) {
        return NextResponse.json({ matched: 0, message: "マスターデータなし" });
    }

    // AIマッチング実行
    const aiMatches = await aiMatchItems(data, allItems);

    // マッチ結果をDBに保存
    let savedCount = 0;
    for (const [itemId, match] of Object.entries(aiMatches)) {
        await supabase
            .from("pending_estimate_items")
            .update({
                matched_ingredient_id: match.ingredientId,
                matched_ingredient_name: match.ingredientName,
                match_confidence: match.confidence,
            })
            .eq("id", itemId);
        savedCount++;
    }

    return NextResponse.json({
        matched: savedCount,
        total: data.length,
        message: `${savedCount}/${data.length}件をマッチしました`,
    });
}

// PATCH: 見積もり項目に対するアクション
export async function PATCH(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();
    const { action, itemId, ingredientId, newIngredientData } = body;
    // targetTable: "ingredient" or "material" (デフォルトはingredient)
    const targetTable = body.targetTable === "material" ? "materials" : "ingredients";

    // 一括スキップ（1リクエストで複数件処理）
    if (action === "bulk_skip") {
        const itemIds: string[] = body.itemIds || [];
        if (itemIds.length === 0) {
            return NextResponse.json({ error: "itemIds is required" }, { status: 400 });
        }
        const { error } = await supabase
            .from("pending_estimate_items")
            .update({
                status: "skipped",
                applied_action: "bulk_skipped",
                applied_at: new Date().toISOString(),
            })
            .in("id", itemIds);
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, skipped: itemIds.length });
    }

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
                // 見積書の単価は税別 → DBは税込で保存
                const taxRate = item.tax_rate || 0.1; // デフォルト10%
                updateData.price = Math.round(item.unit_price * (1 + taxRate) * 100) / 100;
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

            const { error: statusErr } = await supabase
                .from("pending_estimate_items")
                .update({
                    status: "applied",
                    applied_action: "price_updated",
                    applied_at: new Date().toISOString(),
                    matched_ingredient_id: ingredientId,
                })
                .eq("id", itemId);

            if (statusErr) {
                console.error("[Estimates PATCH] status update failed:", statusErr.message);
                return NextResponse.json({ error: `ステータス更新失敗: ${statusErr.message}` }, { status: 500 });
            }

            return NextResponse.json({ success: true, action: "price_updated" });
        }

        if (action === "create_new") {
            // 見積書の単価は税別 → DBは税込で保存
            const taxRate = item.tax_rate || 0.1;
            const priceExclTax = item.unit_price || item.amount;
            const priceInclTax = priceExclTax != null
                ? Math.round(priceExclTax * (1 + taxRate) * 100) / 100
                : null;

            const itemData: any = {
                name: newIngredientData?.name || item.item_name,
                unit_quantity: newIngredientData?.unit_quantity || 1,
                price: priceInclTax,
                tax_included: true,
            };

            const { data: newItem, error: insertErr } = await supabase
                .from(targetTable)
                .insert(itemData)
                .select()
                .single();

            if (insertErr) throw insertErr;

            const { error: statusErr } = await supabase
                .from("pending_estimate_items")
                .update({
                    status: "applied",
                    applied_action: "created_new",
                    applied_at: new Date().toISOString(),
                    matched_ingredient_id: newItem.id,
                })
                .eq("id", itemId);

            if (statusErr) {
                console.error("[Estimates PATCH] create_new status update failed:", statusErr.message);
                return NextResponse.json({ error: `ステータス更新失敗: ${statusErr.message}` }, { status: 500 });
            }

            return NextResponse.json({ success: true, action: "created_new", ingredientId: newItem.id });
        }

        if (action === "reject" || action === "skip") {
            const { error: statusErr } = await supabase
                .from("pending_estimate_items")
                .update({
                    status: action === "reject" ? "rejected" : "skipped",
                    applied_at: new Date().toISOString(),
                    notes: body.notes || null,
                })
                .eq("id", itemId);

            if (statusErr) {
                console.error("[Estimates PATCH] reject/skip status update failed:", statusErr.message);
                return NextResponse.json({ error: `ステータス更新失敗: ${statusErr.message}` }, { status: 500 });
            }

            return NextResponse.json({ success: true, action });
        }

        // 復活: skipped/rejected → pending に戻す
        if (action === "restore") {
            const { error: statusErr } = await supabase
                .from("pending_estimate_items")
                .update({
                    status: "pending",
                    applied_action: null,
                    applied_at: null,
                    notes: null,
                })
                .eq("id", itemId);

            if (statusErr) {
                console.error("[Estimates PATCH] restore failed:", statusErr.message);
                return NextResponse.json({ error: `復活失敗: ${statusErr.message}` }, { status: 500 });
            }

            return NextResponse.json({ success: true, action: "restored" });
        }

        // 一括復活
        if (action === "bulk_restore") {
            const itemIds: string[] = body.itemIds || [];
            if (itemIds.length === 0) {
                return NextResponse.json({ error: "itemIds is required" }, { status: 400 });
            }
            const { error } = await supabase
                .from("pending_estimate_items")
                .update({
                    status: "pending",
                    applied_action: null,
                    applied_at: null,
                    notes: null,
                })
                .in("id", itemIds);
            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            return NextResponse.json({ success: true, restored: itemIds.length });
        }

        return NextResponse.json({ error: "不明なaction" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
