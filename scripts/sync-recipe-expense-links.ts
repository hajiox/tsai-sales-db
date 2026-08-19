import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import {
  normalizeMasterName,
  syncRecipeItemsForMaster,
} from "../lib/recipe-cost-sync";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase environment variables are not configured");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const { data: expenses, error: expenseError } = await supabase
    .from("expenses")
    .select("id, name, unit_price");
  if (expenseError) throw expenseError;

  const byNormalizedName = new Map<string, any[]>();
  for (const expense of expenses || []) {
    const key = normalizeMasterName(expense.name);
    const matches = byNormalizedName.get(key) || [];
    matches.push(expense);
    byNormalizedName.set(key, matches);
  }

  const duplicates = Array.from(byNormalizedName.entries()).filter(
    ([, matches]) => matches.length > 1,
  );
  if (duplicates.length > 0) {
    throw new Error(
      `Normalized duplicate expense masters found: ${duplicates
        .map(([, matches]) => matches.map((item) => item.name).join(" / "))
        .join(", ")}`,
    );
  }

  const { data: items, error: itemError } = await supabase
    .from("recipe_items")
    .select("id, item_name, expense_id")
    .eq("item_type", "expense");
  if (itemError) throw itemError;

  let linkedItems = 0;
  const unmatchedNames = new Set<string>();
  for (const item of items || []) {
    const match = byNormalizedName.get(normalizeMasterName(item.item_name))?.[0];
    if (!match) {
      unmatchedNames.add(item.item_name);
      continue;
    }
    if (item.expense_id === match.id && item.item_name === match.name) continue;

    const { error } = await supabase
      .from("recipe_items")
      .update({
        expense_id: match.id,
        item_name: match.name,
      })
      .eq("id", item.id);
    if (error) throw error;
    linkedItems++;
  }

  const nekopos = (expenses || []).find(
    (expense) => normalizeMasterName(expense.name) === normalizeMasterName("ネコポス送料"),
  );
  if (!nekopos) throw new Error("ネコポス送料マスターが見つかりません");

  const syncResult = await syncRecipeItemsForMaster(
    supabase,
    "expense",
    nekopos.id,
  );

  console.log(JSON.stringify({
    linkedItems,
    unmatchedNames: Array.from(unmatchedNames).sort(),
    nekopos: {
      id: nekopos.id,
      price: nekopos.unit_price,
      updatedItems: syncResult.updatedItems,
      affectedRecipes: syncResult.affectedRecipes,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
