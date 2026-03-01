// app/api/series/route.ts
// シリーズマスターの CRUD API

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET: 全シリーズ取得
export async function GET() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
        .from("series")
        .select("*")
        .order("code");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}

// POST: シリーズ追加
export async function POST(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();
    const { code, name } = body;

    if (!code || !name) {
        return NextResponse.json({ error: "code と name は必須です" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("series")
        .insert({ code, name })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}

// PATCH: シリーズ更新
export async function PATCH(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();
    const { id, code, name } = body;

    if (!id) {
        return NextResponse.json({ error: "id は必須です" }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (code !== undefined) updates.code = code;
    if (name !== undefined) updates.name = name;

    const { error } = await supabase.from("series").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // recipes と products の series 名も連動更新
    if (name !== undefined && code !== undefined) {
        await supabase.from("recipes").update({ series: name }).eq("series_code", code);
        await supabase.from("products").update({ series: name }).eq("series_code", code);
    }

    return NextResponse.json({ success: true });
}

// DELETE: シリーズ削除
export async function DELETE(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "id は必須です" }, { status: 400 });
    }

    const { error } = await supabase.from("series").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
