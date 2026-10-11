import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireRecipeAdminRequest } from "@/lib/recipe-request-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Schema changes are migrations only; missing tables fail closed.

// GET: レシピのバージョン一覧を取得
export async function GET(request: Request) {
  const authError = await requireRecipeAdminRequest(request);
  if (authError) return authError;

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
  const authError = await requireRecipeAdminRequest(request);
  if (authError) return authError;

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

// PATCH: バージョンメモを更新
export async function PATCH(request: Request) {
  const authError = await requireRecipeAdminRequest(request);
  if (authError) return authError;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await request.json();
    const { id, note } = body;

    if (!id) {
      return NextResponse.json(
        { error: "idが必要です" },
        { status: 400 }
      );
    }

    const normalizedNote = typeof note === "string" ? note.trim() || null : null;

    const { data, error } = await supabase
      .from("recipe_versions")
      .update({ version_note: normalizedNote })
      .eq("id", id)
      .select("id, version_number, version_note, created_at, snapshot_recipe, snapshot_items")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      version: data,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: バージョンを削除
export async function DELETE(request: Request) {
  const authError = await requireRecipeAdminRequest(request);
  if (authError) return authError;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get("id");

  if (!versionId) {
    return NextResponse.json(
      { error: "idが必要です" },
      { status: 400 }
    );
  }

  try {
    const { error } = await supabase
      .from("recipe_versions")
      .delete()
      .eq("id", versionId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
