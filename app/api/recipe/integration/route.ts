
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Use Service Role Key if available to bypass RLS for admin tasks
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// GET: Fetch unlinked items grouped by name and type
export async function GET() {
    try {
        // Fetch all recipe_items
        const { data: items, error } = await supabase
            .from('recipe_items')
            .select('id, item_name, item_type, ingredient_id, material_id, intermediate_recipe_id');

        if (error) {
            console.error("Step 1 Error:", error);
            throw error;
        }

        // Filter unlinked items
        // (We do this in memory because filtering for "all FKs are null" in Supabase syntax is verbose and might miss items if columns don't exist yet - wait, if columns don't exist,select will fail)
        // Assuming columns exist.

        const unlinkedItems = items.filter((item: any) =>
            !item.ingredient_id && !item.material_id && !item.intermediate_recipe_id
        );

        // Group by name + type
        const grouped = unlinkedItems.reduce((acc: any, item: any) => {
            // Key by name mostly. Type splits slightly but usually name is unique enough.
            // Let's group by Name ONLY, but track most common type.
            const key = item.item_name;
            if (!acc[key]) {
                acc[key] = {
                    name: item.item_name,
                    types: {},
                    count: 0,
                    ids: []
                };
            }
            acc[key].count++;
            acc[key].ids.push(item.id);

            const t = item.item_type || 'unknown';
            acc[key].types[t] = (acc[key].types[t] || 0) + 1;

            return acc;
        }, {});

        const result = Object.values(grouped).map((g: any) => ({
            name: g.name,
            count: g.count,
            // Pick dominant type
            dominantType: Object.keys(g.types).reduce((a, b) => g.types[a] > g.types[b] ? a : b)
        })).sort((a: any, b: any) => b.count - a.count);

        return NextResponse.json(result);
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: 'Failed to fetch unlinked items' }, { status: 500 });
    }
}

// POST: Link items to a master
export async function POST(request: Request) {
    try {
        const {
            targetName, // The old name to find
            masterId,   // The ID of the master record to link to
            masterType, // 'ingredient', 'material', 'recipe'
            masterName  // The correct name from master
        } = await request.json();

        if (!targetName || !masterId || !masterType || !masterName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Prepare update object
        const updates: any = {
            item_name: masterName // Update name to match master
        };

        // Set the appropriate FK
        if (masterType === 'ingredient') {
            updates.ingredient_id = masterId;
            updates.item_type = 'ingredient';
        } else if (masterType === 'material') {
            updates.material_id = masterId;
            updates.item_type = 'material';
        } else if (masterType === 'recipe') {
            updates.intermediate_recipe_id = masterId;
            updates.item_type = 'intermediate'; // Default to intermediate if linking to a recipe
        } else if (masterType === 'product') { // Just in case
            updates.intermediate_recipe_id = masterId;
            updates.item_type = 'intermediate'; // Treat product usage as intermediate in this context? Or keep 'product'?
            // The user wants to link intermediates mostly.
        }

        // Perform Update
        const { error } = await supabase
            .from('recipe_items')
            .update(updates)
            .eq('item_name', targetName);

        if (error) {
            console.error("Update failed:", error);
            throw error;
        }

        return NextResponse.json({ success: true, message: `Updated items with name "${targetName}"` });
    } catch (error) {
        console.error("Error linking items:", error);
        return NextResponse.json({ error: 'Failed to link items' }, { status: 500 });
    }
}
