// app/api/products/hide/route.ts
// 商品の終売（非表示）管理API - service roleキーで実行（RLS回避）

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
    return createClient(supabaseUrl, supabaseServiceKey);
}

// GET: 終売商品一覧を取得
export async function GET() {
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from("products")
            .select("id, name, price, profit_rate, series, is_hidden")
            .eq("is_hidden", true)
            .order("name");

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: 商品の is_hidden を更新（非表示 or 復活）
export async function POST(request: Request) {
    try {
        const { productId, isHidden } = await request.json();

        if (!productId) {
            return NextResponse.json({ error: "productId は必須です" }, { status: 400 });
        }

        const supabase = getSupabase();
        const { error } = await supabase
            .from("products")
            .update({ is_hidden: isHidden ?? true })
            .eq("id", productId);

        if (error) {
            console.error("商品非表示/復活エラー:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: 商品を完全に削除
export async function DELETE(request: Request) {
    try {
        const { productId } = await request.json();

        if (!productId) {
            return NextResponse.json({ error: "productId は必須です" }, { status: 400 });
        }

        const supabase = getSupabase();
        const { error } = await supabase
            .from("products")
            .delete()
            .eq("id", productId);

        if (error) {
            console.error("商品削除エラー:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
