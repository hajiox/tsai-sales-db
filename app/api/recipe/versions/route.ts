import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// テーブルが存在しない場合に自動作成
async function ensureTable(supabase: any) {
  // テーブルの存在確認
  const { error: checkError } = await supabase
    .from("recipe_versions")
    .select("id")
    .limit(1);

  if (checkError && checkError.code === "42P01") {
    // テーブルが存在しない場合、RPC経由でCREATE TABLE
    const { error: createError } = await supabase.rpc("exec_sql", {
      sql: `
        CREATE TABLE IF NOT EXISTS recipe_versions (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
          version_number integer NOT NULL,
          version_note text,
          snapshot_recipe jsonb NOT NULL,
          snapshot_items jsonb NOT NULL,
          created_at timestamptz DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe_id ON recipe_versions(recipe_id);
        CREATE INDEX IF NOT EXISTS idx_recipe_versions_created_at ON recipe_versions(created_at);
      `,
    });
    if (createError) {
      console.error("テーブル作成エラー（RPC未対応の可能性）:", createError);
    }
  }
}

// GET: レシピのバージョン一覧を取得
export async function GET(request: Request) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { searchParams } = new URL(request.url);
  const recipeId = searchParams.get("recipeId");

  if (!recipeId) {
    return NextResponse.json(
      { error: "recipeIdが必要です" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("recipe_versions")
      .select("id, version_number, version_note, created_at, snapshot_recipe, snapshot_items")
      .eq("recipe_id", recipeId)
      .order("version_number", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ versions: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: バージョンスナップショットを保存
export async function POST(request: Request) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await request.json();
    const { recipeId, note } = body;

    if (!recipeId) {
      return NextResponse.json(
        { error: "recipeIdが必要です" },
        { status: 400 }
      );
    }

    // 現在のレシピデータを取得
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", recipeId)
      .single();

    if (recipeError || !recipe) {
      return NextResponse.json(
        { error: "レシピが見つかりません" },
        { status: 404 }
      );
    }

    // 現在のレシピアイテムを取得
    const { data: items, error: itemsError } = await supabase
      .from("recipe_items")
      .select("*")
      .eq("recipe_id", recipeId)
      .order("id");

    if (itemsError) throw itemsError;

    // 次のバージョン番号を取得
    const { data: latestVersion } = await supabase
      .from("recipe_versions")
      .select("version_number")
      .eq("recipe_id", recipeId)
      .order("version_number", { ascending: false })
      .limit(1);

    const nextVersion =
      latestVersion && latestVersion.length > 0
        ? latestVersion[0].version_number + 1
        : 1;

    // スナップショットを保存
    const { data: saved, error: saveError } = await supabase
      .from("recipe_versions")
      .insert({
        recipe_id: recipeId,
        version_number: nextVersion,
        version_note: note || null,
        snapshot_recipe: recipe,
        snapshot_items: items || [],
      })
      .select()
      .single();

    if (saveError) throw saveError;

    return NextResponse.json({
      success: true,
      version: saved,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
