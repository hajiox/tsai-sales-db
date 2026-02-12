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

async function checkNutrition() {
    console.log("Checking ingredients nutrition data...");
    const { data, error } = await supabase
        .from("ingredients")
        .select("name, calories, protein, fat, carbohydrate, sodium")
        .not("calories", "is", null) // カロリーが入っているものを優先して取得
        .limit(10);

    if (error) {
        console.error("Error:", error);
        return;
    }

    let result = "Data found (Not Null Calories):\n" + JSON.stringify(data, null, 2) + "\n\n";

    // カロリーがnullのものも確認
    const { data: nullData, count, error: countError } = await supabase
        .from("ingredients")
        .select("name, calories", { count: 'exact' })
        .is("calories", null)
        .limit(10);

    if (!countError) {
        result += `Ingredients with NULL calories (Total: ${count}):\n` + JSON.stringify(nullData, null, 2);
    }

    fs.writeFileSync("nutrition_check_result.txt", result);
    console.log("Written to nutrition_check_result.txt");
}

checkNutrition();
