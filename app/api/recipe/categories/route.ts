// app/api/recipe/categories/route.ts
// カテゴリAPI

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// GET: カテゴリ一覧取得
export async function GET() {
    try {
        const { data, error } = await supabase
            .from("recipe_categories")
            .select("*")
            .order("name");

        if (error) {
            console.error("Category fetch error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ data });
    } catch (error) {
        console.error("Category API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST: カテゴリ作成
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const { data, error } = await supabase
            .from("recipe_categories")
            .insert({
                name: body.name,
                description: body.description,
            })
            .select()
            .single();

        if (error) {
            console.error("Category create error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error("Category create API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
