import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function normalize(s: string): string {
    return s
        .replace(/【.*?】/g, "")
        .replace(/\[.*?\]/g, "")
        .replace(/[（()）\s　→]/g, "")
        .replace(/×/g, "x")
        .toLowerCase()
        .trim();
}

// GET: Find duplicate recipes
export async function GET() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { data: recipes, error } = await supabase
            .from("recipes")
            .select("id, name, category, linked_product_id, selling_price, total_cost, source_file, series, series_code, product_code, created_at")
            .order("name");

        if (error) throw error;

        // Count recipe_items for each recipe
        const { data: itemCounts, error: countError } = await supabase
            .from("recipe_items")
            .select("recipe_id");

        if (countError) throw countError;

        const itemCountMap = new Map<string, number>();
        for (const item of itemCounts || []) {
            itemCountMap.set(item.recipe_id, (itemCountMap.get(item.recipe_id) || 0) + 1);
        }

        // Group by normalized name
        const groups = new Map<string, any[]>();
        for (const r of recipes || []) {
            const key = normalize(r.name);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push({
                ...r,
                item_count: itemCountMap.get(r.id) || 0,
            });
        }

        // Only keep groups with duplicates
        const duplicateGroups: any[] = [];
        for (const [normName, members] of groups) {
            if (members.length > 1) {
                // Determine which one to keep (priority: linked > has items > has price > oldest)
                const sorted = [...members].sort((a, b) => {
                    // Linked ones come first
                    if (a.linked_product_id && !b.linked_product_id) return -1;
                    if (!a.linked_product_id && b.linked_product_id) return 1;
                    // More items = better
                    if (a.item_count !== b.item_count) return b.item_count - a.item_count;
                    // Has price = better
                    if (a.selling_price && !b.selling_price) return -1;
                    if (!a.selling_price && b.selling_price) return 1;
                    // Older = original
                    return (a.created_at || "").localeCompare(b.created_at || "");
                });

                duplicateGroups.push({
                    normalizedName: normName,
                    keepId: sorted[0].id,
                    members: sorted,
                });
            }
        }

        // Sort by normalized name
        duplicateGroups.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName, "ja"));

        return NextResponse.json({
            groups: duplicateGroups,
            totalGroups: duplicateGroups.length,
            totalDuplicates: duplicateGroups.reduce((sum, g) => sum + g.members.length - 1, 0),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Merge/delete duplicates
export async function POST(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const body = await request.json();

        if (body.action === "delete_one") {
            // Delete a single recipe
            const { recipeId } = body;

            // 紐付済みの場合は先に解除
            await supabase
                .from("recipes")
                .update({ linked_product_id: null })
                .eq("id", recipeId);

            // Delete recipe items first
            await supabase.from("recipe_items").delete().eq("recipe_id", recipeId);
            // Delete recipe
            const { error } = await supabase.from("recipes").delete().eq("id", recipeId);
            if (error) throw error;

            return NextResponse.json({ success: true, deleted: 1 });
        }

        if (body.action === "merge_group") {
            // Keep one, delete the rest in a group
            const { keepId, deleteIds } = body;

            // Get the keep recipe's data for merging
            const { data: keepRecipe } = await supabase
                .from("recipes")
                .select("*")
                .eq("id", keepId)
                .single();

            // For each delete candidate, merge useful data into keep recipe
            for (const deleteId of deleteIds) {
                const { data: deleteRecipe } = await supabase
                    .from("recipes")
                    .select("*, linked_product_id")
                    .eq("id", deleteId)
                    .single();

                if (!deleteRecipe) continue;

                // Transfer linked_product_id if keep doesn't have one
                if (deleteRecipe.linked_product_id && !keepRecipe?.linked_product_id) {
                    await supabase
                        .from("recipes")
                        .update({ linked_product_id: deleteRecipe.linked_product_id })
                        .eq("id", keepId);
                }

                // Transfer series info if keep doesn't have it
                if (deleteRecipe.series_code && !keepRecipe?.series_code) {
                    await supabase
                        .from("recipes")
                        .update({
                            series: deleteRecipe.series,
                            series_code: deleteRecipe.series_code,
                            product_code: deleteRecipe.product_code,
                        })
                        .eq("id", keepId);
                }

                // Transfer selling_price if keep doesn't have it
                if (deleteRecipe.selling_price && !keepRecipe?.selling_price) {
                    await supabase
                        .from("recipes")
                        .update({ selling_price: deleteRecipe.selling_price })
                        .eq("id", keepId);
                }

                // Delete items then recipe
                await supabase.from("recipe_items").delete().eq("recipe_id", deleteId);
                await supabase.from("recipes").delete().eq("id", deleteId);
            }

            return NextResponse.json({ success: true, deleted: deleteIds.length });
        }

        if (body.action === "auto_cleanup") {
            // Auto-merge all groups: keep the best, delete the rest
            const res = await fetch(new URL("/api/recipe/duplicates", request.url).toString());
            const data = await res.json();

            let totalDeleted = 0;
            for (const group of data.groups) {
                const keepId = group.keepId;
                const deleteIds = group.members
                    .filter((m: any) => m.id !== keepId)
                    .map((m: any) => m.id);

                // Same merge logic
                const { data: keepRecipe } = await supabase
                    .from("recipes")
                    .select("*")
                    .eq("id", keepId)
                    .single();

                for (const deleteId of deleteIds) {
                    const { data: deleteRecipe } = await supabase
                        .from("recipes")
                        .select("*")
                        .eq("id", deleteId)
                        .single();

                    if (!deleteRecipe) continue;

                    if (deleteRecipe.linked_product_id && !keepRecipe?.linked_product_id) {
                        await supabase
                            .from("recipes")
                            .update({ linked_product_id: deleteRecipe.linked_product_id })
                            .eq("id", keepId);
                        if (keepRecipe) keepRecipe.linked_product_id = deleteRecipe.linked_product_id;
                    }

                    if (deleteRecipe.series_code && !keepRecipe?.series_code) {
                        await supabase
                            .from("recipes")
                            .update({
                                series: deleteRecipe.series,
                                series_code: deleteRecipe.series_code,
                                product_code: deleteRecipe.product_code,
                            })
                            .eq("id", keepId);
                    }

                    if (deleteRecipe.selling_price && !keepRecipe?.selling_price) {
                        await supabase
                            .from("recipes")
                            .update({ selling_price: deleteRecipe.selling_price })
                            .eq("id", keepId);
                    }

                    await supabase.from("recipe_items").delete().eq("recipe_id", deleteId);
                    await supabase.from("recipes").delete().eq("id", deleteId);
                    totalDeleted++;
                }
            }

            return NextResponse.json({ success: true, deleted: totalDeleted });
        }

        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
