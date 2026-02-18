import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars = {};
envContent.split("\n").forEach(line => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0) envVars[key.trim()] = rest.join("=").trim();
});

const SUPABASE_URL = envVars["NEXT_PUBLIC_SUPABASE_URL"];
const SUPABASE_KEY = envVars["SUPABASE_SERVICE_ROLE_KEY"];

async function query(table, params = "") {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
    const res = await fetch(url, {
        headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
        }
    });
    return res.json();
}

async function main() {
    // 1. Check which recipes use 【商品】items
    const recipeItems = await query("recipe_items", "select=id,recipe_id,item_name,item_type");
    const productUsages = recipeItems.filter(i => i.item_name.includes("【商品】"));
    const uniqueRecipeIds = [...new Set(productUsages.map(i => i.recipe_id))];

    console.log("=== 【商品】を使用しているレシピ ===");
    for (const id of uniqueRecipeIds) {
        const r = await query("recipes", `select=name,is_intermediate&id=eq.${id}`);
        const items = productUsages.filter(i => i.recipe_id === id);
        console.log(`  ${r[0]?.name} (中間: ${r[0]?.is_intermediate})`);
        items.forEach(i => console.log(`    -> ${i.item_name} (type: ${i.item_type})`));
    }

    // 2. Match 【P】ingredients against intermediate recipes
    const ings = await query("ingredients", "select=id,name");
    const pIngs = ings.filter(i => i.name.includes("【P】"));
    const recipes = await query("recipes", "select=id,name&is_intermediate=eq.true");

    console.log("\n=== 【P】食材 vs 中間部品レシピ 照合 ===");
    for (const p of pIngs) {
        const recipeMatch = recipes.find(r => r.name === p.name);
        const status = recipeMatch ? `EXISTS (${recipeMatch.id})` : "*** NO MATCH ***";
        console.log(`  ${p.name} => ${status}`);
    }

    // 3. Check recipe_items referencing 【P】as "ingredient" type (should be "intermediate")
    const pNames = pIngs.map(i => i.name);
    const pRecipeItems = recipeItems.filter(ri => pNames.includes(ri.item_name));

    console.log("\n=== 【P】のレシピ使用状況 (type別) ===");
    const asIngredient = pRecipeItems.filter(ri => ri.item_type === "ingredient");
    const asIntermediate = pRecipeItems.filter(ri => ri.item_type === "intermediate");
    console.log(`  ingredient として使用: ${asIngredient.length}件`);
    asIngredient.forEach(ri => console.log(`    ${ri.item_name}`));
    console.log(`  intermediate として使用: ${asIntermediate.length}件`);
    asIntermediate.forEach(ri => console.log(`    ${ri.item_name}`));
}

main().catch(console.error);
