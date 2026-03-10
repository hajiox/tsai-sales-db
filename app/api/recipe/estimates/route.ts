import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET: pending_estimate_items 取得
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

    // pending件数も返す
    const { count } = await supabase
        .from("pending_estimate_items")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

    // 既存材料マスターも返す（マッチング候補表示用）
    const { data: ingredients, error: ingError } = await supabase
        .from("ingredients")
        .select("id, name, price, price_excl_tax, supplier, unit_quantity")
        .order("name")
        .limit(1000);

    if (ingError) {
        console.error("[estimates API] ingredients取得エラー:", ingError.message);
    }
    console.log(`[estimates API] items=${data?.length}, ingredients=${ingredients?.length}, serviceKey=${supabaseServiceKey ? 'set' : 'NOT SET'}`);

    return NextResponse.json({
        items: data,
        pendingCount: count || 0,
        ingredients: ingredients || [],
        _debug: {
            ingCount: ingredients?.length ?? -1,
            ingError: ingError?.message ?? null,
            hasServiceKey: !!supabaseServiceKey,
            supabaseUrl: supabaseUrl?.substring(0, 30),
        },
    });
}

// PATCH: 見積もり項目に対するアクション
export async function PATCH(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();
    const { action, itemId, ingredientId, newIngredientData } = body;

    if (!itemId || !action) {
        return NextResponse.json({ error: "itemId and action are required" }, { status: 400 });
    }

    // 対象の見積もり項目を取得
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
            // 既存材料の単価を更新
            if (!ingredientId) return NextResponse.json({ error: "ingredientId is required" }, { status: 400 });

            const updateData: any = {};
            if (item.unit_price != null) {
                updateData.price_excl_tax = item.unit_price;
                updateData.price = item.unit_price; // price_incl_taxとして使われているフィールド
            }
            if (item.counterparty_name) {
                updateData.supplier = item.counterparty_name;
            }

            const { error: updateErr } = await supabase
                .from("ingredients")
                .update(updateData)
                .eq("id", ingredientId);

            if (updateErr) throw updateErr;

            // ステータスを更新
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
            // 新規材料として登録
            const ingredientData = {
                name: newIngredientData?.name || item.item_name,
                unit_quantity: newIngredientData?.unit_quantity || 1,
                price: item.unit_price || item.amount,
                price_excl_tax: item.unit_price || item.amount,
                supplier: item.counterparty_name,
                ...(newIngredientData || {}),
            };

            const { data: newIng, error: insertErr } = await supabase
                .from("ingredients")
                .insert(ingredientData)
                .select()
                .single();

            if (insertErr) throw insertErr;

            // ステータスを更新
            await supabase
                .from("pending_estimate_items")
                .update({
                    status: "applied",
                    applied_action: "created_new",
                    applied_at: new Date().toISOString(),
                    matched_ingredient_id: newIng.id,
                })
                .eq("id", itemId);

            return NextResponse.json({ success: true, action: "created_new", ingredientId: newIng.id });
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
