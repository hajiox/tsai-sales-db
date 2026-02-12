import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing supabase env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Checking recipes details...");
    let output = "";

    const { data: recipes } = await supabase
        .from('recipes')
        .select('id, name')
        .eq('is_intermediate', false)
        .limit(3);

    if (!recipes) return;

    for (const recipe of recipes) {
        output += `\nRecipe: ${recipe.name} (${recipe.id})\n`;
        const { data: items } = await supabase
            .from('recipe_items')
            .select('*')
            .eq('recipe_id', recipe.id);

        if (items) {
            items.forEach(item => {
                output += ` - ${item.item_name}: type=${item.item_type}, usage=${item.usage_amount}, unit_quantity=${item.unit_quantity}, unit_price=${item.unit_price}\n`;
            });
        }
    }

    fs.writeFileSync("check_recipes.txt", output);
    console.log("Written to check_recipes.txt");
}

main();
