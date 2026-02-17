
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Fetching recipe_categories...");
    const { data: categories, error } = await supabase
        .from("recipe_categories")
        .select("*")
        .order("display_order", { ascending: true });

    if (error) {
        console.error("Error fetching categories:", error);
        return;
    }

    console.log("Categories found:", categories);
}

main();
